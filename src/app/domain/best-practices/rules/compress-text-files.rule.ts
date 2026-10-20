import { BestPracticeRule } from "../rule";
import { MIN_TEXT_FILE_BYTES } from "../../text-content/policy";
import { formatKo } from "./image-rule-helpers";
import { isSuccess2xx, lastRequestPerUrl, textFileType } from "./request-helpers";
import { capLines, fileLine, plural, RuleLine } from "./rule-lines";

type Kind = "none" | "weak" | "good" | "unknown";

const GOOD_ENCODINGS = ["br", "gzip", "x-gzip", "zstd"];

/** The last listed encoding is the effective one (US-008 §2). */
function effectiveEncoding(header: string | undefined): string {
  if (header === undefined) return "";
  const tokens = header
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== "");
  return tokens.length === 0 ? "" : tokens[tokens.length - 1];
}

function classify(encoding: string): Kind {
  if (encoding === "" || encoding === "identity") return "none";
  if (encoding === "deflate") return "weak";
  return GOOD_ENCODINGS.includes(encoding) ? "good" : "unknown";
}

interface Offender {
  url: string;
  type: string;
  size: number;
  weak: boolean;
}

/** US-008: HTML, CSS, JS and SVG files transferred without compression, or with deflate only. */
export const compressTextFilesRule: BestPracticeRule = {
  id: "CompressTextFiles",
  name: "Compresser les fichiers textuels",
  category: "network",
  evaluate: ({ requests }) => {
    const offenders: Offender[] = [];
    const unknown = new Set<string>();
    for (const r of lastRequestPerUrl(requests, isSuccess2xx).values()) {
      const type = textFileType(r);
      if (type === undefined || r.responseSize < MIN_TEXT_FILE_BYTES) continue;
      const headers = r.responseHeaders;
      if (headers === undefined || Object.keys(headers).length === 0) continue;
      const encoding = effectiveEncoding(headers["content-encoding"]);
      const kind = classify(encoding);
      if (kind === "unknown") unknown.add(encoding);
      if (kind === "none" || kind === "weak") {
        offenders.push({ url: r.url.href, type, size: r.responseSize, weak: kind === "weak" });
      }
    }
    const suffix =
      unknown.size === 0
        ? ""
        : ` (encodage non reconnu considéré comme compressé : ${[...unknown].join(", ")})`;
    if (offenders.length === 0) {
      return { compliance: "A", detail: `Tous les fichiers textuels sont compressés${suffix}` };
    }
    offenders.sort(
      (a, b) => Number(a.weak) - Number(b.weak) || b.size - a.size || a.url.localeCompare(b.url)
    );
    const none = offenders.filter((o) => !o.weak).length;
    const weak = offenders.length - none;
    const parts: string[] = [];
    if (none > 0) {
      parts.push(`${none} ${plural(none, "fichier textuel non compressé", "fichiers textuels non compressés")}`);
    }
    if (weak > 0) {
      const weakText = "en compression faible (deflate)";
      parts.push(
        none > 0
          ? `${weak} ${weakText}`
          : `${weak} ${plural(weak, "fichier textuel", "fichiers textuels")} ${weakText}`
      );
    }
    const lines: RuleLine[] = offenders.map((o) =>
      fileLine(
        o.url,
        ` (${o.type}, ${formatKo(o.size)}) : ${o.weak ? "compression faible (deflate)" : "non compressé"}`
      )
    );
    return {
      compliance: none > 0 ? "C" : "B",
      detail: `${parts.join(", ")}${suffix}`,
      ...capLines(lines),
    };
  },
};
