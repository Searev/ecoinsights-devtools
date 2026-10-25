import { NetworkRequest } from "../../models/network-request";
import {
  ContentJob,
  ContentNotEvaluatedReason,
  ContentState,
  UNAVAILABLE_CONTENTS,
  removableShare,
} from "../../models/text-content";
import {
  MAX_CONTENT_BYTES,
  MINIFIED_MAX_REMOVABLE_SHARE,
  MIN_REMOVABLE_CHARACTERS,
  MIN_TEXT_FILE_BYTES,
} from "../../text-content/policy";
import { BestPracticeRule } from "../rule";
import { formatKo } from "./image-rule-helpers";
import { RuleLine, capLines, fileLine, plural } from "./rule-lines";
import {
  contentTypeCharset,
  isDeclaredMinified,
  isSuccess2xx,
  lastRequestPerUrl,
  textFileType,
} from "./request-helpers";

interface ScopedFile {
  job: ContentJob;
  size: number;
  /** US-021: `.min.js`, `.min.mjs` or `.min.css`; minified without reading its content. */
  declared: boolean;
}

/** US-010 §2: successful text files of 1 000 bytes or more, one per URL. */
function filesInScope(requests: readonly NetworkRequest[]): ScopedFile[] {
  const files: ScopedFile[] = [];
  for (const [url, request] of lastRequestPerUrl(
    requests,
    (r) => isSuccess2xx(r) && textFileType(r) !== undefined && r.responseSize >= MIN_TEXT_FILE_BYTES
  )) {
    files.push({
      job: { url, type: textFileType(request)!, charset: contentTypeCharset(request) },
      size: request.responseSize,
      declared: isDeclaredMinified(request.url),
    });
  }
  return files;
}

const REASON_LABELS: Record<ContentNotEvaluatedReason, string> = {
  "content-unavailable": "contenu non disponible",
  "too-large": "fichier trop volumineux",
  "analysis-stopped": "analyse arrêtée",
  "analysis-failed": "échec de l'analyse",
  "analyser-unavailable": "analyse indisponible",
};

/** Omits `offenders` when there is no line. */
const linesOf = (lines: readonly RuleLine[]) => (lines.length === 0 ? {} : capLines(lines));

/** Files over `MAX_CONTENT_BYTES` are never analysed (exactly 5 MB is). */
const TOO_LARGE: ContentState = { status: "not-evaluated", reason: "too-large" };

export const minifyTextFilesRule: BestPracticeRule = {
  id: "MinifyTextFiles",
  name: "Minifier les fichiers CSS, JavaScript, HTML et SVG",
  category: "network",

  contentAnalyses: ({ requests }) =>
    filesInScope(requests)
      .filter((f) => !f.declared && f.size <= MAX_CONTENT_BYTES)
      .map((f) => f.job),

  evaluate: ({ requests, contents = UNAVAILABLE_CONTENTS }) => {
    const files = filesInScope(requests);
    if (files.length === 0) {
      return {
        compliance: "A",
        detail: "Aucun fichier CSS, JavaScript, HTML ou SVG à vérifier",
        indicator: { kind: "ratio", offenders: 0, expected: 0, unit: "unminified-files" },
      };
    }

    // Declared builds are never read: they are minified and out of the progress.
    const declaredCount = files.filter((f) => f.declared).length;
    const states = files
      .filter((f) => !f.declared)
      .map((file) => ({
        ...file,
        state: file.size > MAX_CONTENT_BYTES ? TOO_LARGE : (contents(file.job) ?? { status: "pending" as const }),
      }));

    const pending = states.filter((f) => f.state.status === "pending").length;
    if (pending > 0) {
      const done = states.length - pending;
      return {
        detail: `Analyse en cours… (${done}/${states.length} fichiers)`,
        progress: { done, total: states.length, unit: "files" },
      };
    }

    const offenders: { file: ScopedFile; share: number }[] = [];
    const skipped: (ScopedFile & { reason: ContentNotEvaluatedReason })[] = [];
    let evaluated = declaredCount;
    for (const file of states) {
      const state = file.state;
      if (state.status === "analysed") {
        evaluated++;
        const share = removableShare(state);
        if (share >= MINIFIED_MAX_REMOVABLE_SHARE && state.removableCharacters >= MIN_REMOVABLE_CHARACTERS) {
          offenders.push({ file, share });
        }
      } else if (state.status === "not-evaluated") {
        skipped.push({ ...file, reason: state.reason });
      }
    }

    const lines: RuleLine[] = [
      ...offenders
        .sort(
          (a, b) =>
            b.share * b.file.size - a.share * a.file.size ||
            a.file.job.url.localeCompare(b.file.job.url)
        )
        .map(({ file, share }) =>
          fileLine(
            file.job.url,
            ` (${file.job.type}, ${formatKo(file.size)}) : non minifié (~${Math.round(100 * share)} % d'octets superflus)`,
            "",
            { kind: "text", type: file.job.type }
          )
        ),
      ...skipped
        .sort((a, b) => a.job.url.localeCompare(b.job.url))
        .map((file) =>
          fileLine(
            file.job.url,
            ` (${file.job.type}, ${formatKo(file.size)}) : non évalué (${REASON_LABELS[file.reason]})`
          )
        ),
    ];

    if (evaluated === 0) {
      return { detail: "Contenu des fichiers non disponible", ...linesOf(lines) };
    }

    const suffix =
      skipped.length === 0
        ? ""
        : ` (${skipped.length} ${plural(skipped.length, "fichier non évalué", "fichiers non évalués")})`;

    if (offenders.length === 0) {
      return {
        compliance: "A",
        detail: `Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés${suffix}`,
        ...linesOf(lines),
        indicator: { kind: "ratio", offenders: 0, expected: evaluated, unit: "unminified-files" },
      };
    }
    return {
      compliance: offenders.length === evaluated ? "C" : "B",
      detail:
        `${offenders.length} ${plural(offenders.length, "fichier", "fichiers")} sur ${evaluated} ` +
        `${plural(offenders.length, "non minifié", "non minifiés")}${suffix}`,
      ...linesOf(lines),
      indicator: { kind: "ratio", offenders: offenders.length, expected: evaluated, unit: "unminified-files" },
    };
  },
};
