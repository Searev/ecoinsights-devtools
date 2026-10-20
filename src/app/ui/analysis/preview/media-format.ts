/** Pure wording and rows of the media preview (US-016, ARCH-DECISION-023). */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { isGenericMime, pathExtension } from "../../../domain/best-practices/rules/request-helpers";
import { MediaPreviewSubject } from "../../../domain/models/file-preview";
import { formatResolution } from "../comparison/comparison-format";
import { InfoRow } from "./info-rows";

export const VIDEO_NOT_DISPLAYED_HINT = "Vidéo non affichée sur la page";

export type MediaErrorKind = "unavailable" | "unsupported";

/** What the player reports once the metadata is loaded. */
export interface MediaMetadata {
  duration: number;
  width?: number;
  height?: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "45 s", "1 min 32 s", "2 h 03 min"; "inconnue" for NaN, Infinity or a negative value. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "inconnue";
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min ${pad2(total % 60)} s`;
  return `${Math.floor(total / 3600)} h ${pad2(Math.floor((total % 3600) / 60))} min`;
}

const EXTENSION_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
};

function extensionOf(url: string): string | undefined {
  try {
    return pathExtension(new URL(url));
  } catch {
    return undefined;
  }
}

export function mediaTypeFromExtension(url: string): string | undefined {
  const ext = extensionOf(url);
  return ext === undefined ? undefined : EXTENSION_TYPES[ext];
}

/** The recorded MIME type unless missing or generic, else the type implied by the extension. */
export function effectiveMediaType(subject: MediaPreviewSubject): string | undefined {
  const recorded = subject.mimeType;
  if (recorded !== undefined && !isGenericMime(recorded)) return recorded;
  return mediaTypeFromExtension(subject.url);
}

const MIME_LABELS: Record<string, string> = {
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "audio/webm": "WebM",
  "video/ogg": "Ogg",
  "audio/ogg": "Ogg",
  "application/ogg": "Ogg",
  "audio/mpeg": "MP3",
  "audio/mp3": "MP3",
  "audio/mp4": "M4A",
  "audio/x-m4a": "M4A",
  "audio/m4a": "M4A",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
  "audio/wave": "WAV",
  "audio/vnd.wave": "WAV",
  "audio/aac": "AAC",
  "audio/aacp": "AAC",
  "audio/x-aac": "AAC",
  "audio/flac": "FLAC",
  "audio/x-flac": "FLAC",
};

const EXTENSION_LABELS: Record<string, string> = {
  mp4: "MP4",
  m4v: "MP4",
  webm: "WebM",
  ogg: "Ogg",
  ogv: "Ogg",
  oga: "Ogg",
  opus: "Ogg",
  mp3: "MP3",
  m4a: "M4A",
  wav: "WAV",
  aac: "AAC",
  flac: "FLAC",
};

export function mediaFormatLabel(mimeType: string | undefined, url: string): string {
  const mime = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (!isGenericMime(mime)) return MIME_LABELS[mime] ?? "inconnu";
  const ext = extensionOf(url);
  return (ext === undefined ? undefined : EXTENSION_LABELS[ext]) ?? "inconnu";
}

export function mediaInfoRows(subject: MediaPreviewSubject, metadata?: MediaMetadata): InfoRow[] {
  const rows: InfoRow[] = [];
  if (subject.media === "video") {
    const known = metadata?.width !== undefined && metadata.height !== undefined &&
      metadata.width > 0 && metadata.height > 0;
    rows.push({
      label: "Résolution",
      value: known ? formatResolution(metadata.width!, metadata.height!) : "inconnue",
    });
  }
  rows.push(
    { label: "Durée", value: formatDuration(metadata?.duration) },
    { label: "Format", value: mediaFormatLabel(subject.mimeType, subject.url) },
    {
      label: "Poids téléchargé par la page",
      value: subject.downloadedBytes === undefined ? "non téléchargé par la page" : formatKo(subject.downloadedBytes),
    },
  );
  return rows;
}

export function mediaAccessibleName(fullName: string): string {
  return `Aperçu de ${fullName}`;
}

export function mediaErrorMessage(error: MediaErrorKind): string {
  return error === "unsupported" ? "Ce format n'est pas lu par ce navigateur." : "Média indisponible.";
}

/** ARCH-DECISION-023: code 3 is unsupported; 4 is unsupported only if the page's own request succeeded. */
export function mediaErrorKind(input: { code?: number; recordedStatus?: number }): MediaErrorKind {
  if (input.code === 3) return "unsupported";
  if (input.code === 4) {
    const s = input.recordedStatus;
    return s !== undefined && ((s >= 200 && s < 300) || s === 304) ? "unsupported" : "unavailable";
  }
  return "unavailable";
}
