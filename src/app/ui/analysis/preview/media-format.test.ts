import { describe, expect, it } from "vitest";
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { MediaPreviewSubject } from "../../../domain/models/file-preview";
import {
  VIDEO_NOT_DISPLAYED_HINT,
  effectiveMediaType,
  formatDuration,
  mediaAccessibleName,
  mediaErrorKind,
  mediaErrorMessage,
  mediaFormatLabel,
  mediaInfoRows,
  mediaTypeFromExtension,
} from "./media-format";

function subject(patch: Partial<MediaPreviewSubject> = {}): MediaPreviewSubject {
  return { kind: "media", media: "video", ruleId: "r", url: "https://example.org/intro.mp4", ...patch };
}

describe("formatDuration", () => {
  it.each([
    [45, "45 s"],
    [0, "0 s"],
    [92, "1 min 32 s"],
    [65, "1 min 05 s"],
    [59.6, "1 min 00 s"],
    [59.4, "59 s"],
    [3600, "1 h 00 min"],
    [7380, "2 h 03 min"],
    [7399, "2 h 03 min"],
  ])("%s s gives %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([NaN, Infinity, -1, undefined])("%s gives inconnue", (value) => {
    expect(formatDuration(value as number)).toBe("inconnue");
  });
});

describe("mediaTypeFromExtension", () => {
  it.each([
    ["a.mp4", "video/mp4"],
    ["a.m4v", "video/mp4"],
    ["a.webm", "video/webm"],
    ["a.ogv", "video/ogg"],
    ["a.ogg", "audio/ogg"],
    ["a.oga", "audio/ogg"],
    ["a.opus", "audio/ogg"],
    ["a.mp3", "audio/mpeg"],
    ["a.m4a", "audio/mp4"],
    ["a.wav", "audio/wav"],
    ["a.aac", "audio/aac"],
    ["a.flac", "audio/flac"],
    ["a.MP4?x=1", "video/mp4"],
  ])("%s", (file, expected) => {
    expect(mediaTypeFromExtension(`https://e.org/${file}`)).toBe(expected);
  });

  it("is undefined for unknown extensions and invalid URLs", () => {
    expect(mediaTypeFromExtension("https://e.org/a.xyz")).toBeUndefined();
    expect(mediaTypeFromExtension("https://e.org/stream")).toBeUndefined();
    expect(mediaTypeFromExtension("not a url")).toBeUndefined();
  });
});

describe("effectiveMediaType", () => {
  it("prefers the recorded MIME type", () => {
    expect(effectiveMediaType(subject({ mimeType: "video/webm" }))).toBe("video/webm");
  });
  it("falls back to the extension when missing, empty or generic", () => {
    expect(effectiveMediaType(subject())).toBe("video/mp4");
    expect(effectiveMediaType(subject({ mimeType: "" }))).toBe("video/mp4");
    expect(effectiveMediaType(subject({ mimeType: "application/octet-stream" }))).toBe("video/mp4");
  });
  it("is undefined when nothing tells", () => {
    expect(effectiveMediaType(subject({ url: "https://e.org/x" }))).toBeUndefined();
  });
});

describe("mediaFormatLabel", () => {
  it.each([
    ["video/mp4", "MP4"],
    ["video/webm", "WebM"],
    ["audio/webm", "WebM"],
    ["video/ogg", "Ogg"],
    ["audio/ogg", "Ogg"],
    ["application/ogg", "Ogg"],
    ["audio/mpeg", "MP3"],
    ["audio/mp3", "MP3"],
    ["audio/mp4", "M4A"],
    ["audio/x-m4a", "M4A"],
    ["audio/m4a", "M4A"],
    ["audio/wav", "WAV"],
    ["audio/x-wav", "WAV"],
    ["audio/wave", "WAV"],
    ["audio/vnd.wave", "WAV"],
    ["audio/aac", "AAC"],
    ["audio/aacp", "AAC"],
    ["audio/x-aac", "AAC"],
    ["audio/flac", "FLAC"],
    ["audio/x-flac", "FLAC"],
    ["Video/MP4; codecs=avc1", "MP4"],
  ])("%s gives %s", (mime, expected) => {
    expect(mediaFormatLabel(mime, "https://e.org/x")).toBe(expected);
  });

  it.each([
    ["a.mp4", "MP4"],
    ["a.m4v", "MP4"],
    ["a.webm", "WebM"],
    ["a.ogg", "Ogg"],
    ["a.ogv", "Ogg"],
    ["a.oga", "Ogg"],
    ["a.opus", "Ogg"],
    ["a.mp3", "MP3"],
    ["a.m4a", "M4A"],
    ["a.wav", "WAV"],
    ["a.aac", "AAC"],
    ["a.flac", "FLAC"],
  ])("falls back to the extension of %s for a missing or generic type", (file, expected) => {
    const url = `https://e.org/${file}`;
    expect(mediaFormatLabel(undefined, url)).toBe(expected);
    expect(mediaFormatLabel("", url)).toBe(expected);
    expect(mediaFormatLabel("application/octet-stream", url)).toBe(expected);
  });

  it("is inconnu otherwise, including a known-but-unmapped MIME type", () => {
    expect(mediaFormatLabel(undefined, "https://e.org/x")).toBe("inconnu");
    expect(mediaFormatLabel("video/x-foo", "https://e.org/a.mp4")).toBe("inconnu");
  });
});

describe("mediaInfoRows", () => {
  it("lists a video (US-016 S1)", () => {
    const rows = mediaInfoRows(subject({ mimeType: "video/mp4", downloadedBytes: 2_400_000 }), {
      duration: 92,
      width: 1920,
      height: 1080,
    });
    expect(rows).toEqual([
      { label: "Résolution", value: "1920 × 1080 px" },
      { label: "Durée", value: "1 min 32 s" },
      { label: "Format", value: "MP4" },
      { label: "Poids téléchargé par la page", value: formatKo(2_400_000) },
    ]);
  });

  it("omits the resolution of a sound (S3)", () => {
    const rows = mediaInfoRows(
      subject({ media: "audio", url: "https://e.org/jingle.mp3", downloadedBytes: 100_000 }),
      { duration: 5 },
    );
    expect(rows.map((r) => r.label)).toEqual(["Durée", "Format", "Poids téléchargé par la page"]);
    expect(rows[1].value).toBe("MP3");
  });

  it("shows unknown values before the metadata and when not downloaded (S4)", () => {
    const rows = mediaInfoRows(subject({ url: "https://e.org/x" }));
    expect(rows).toEqual([
      { label: "Résolution", value: "inconnue" },
      { label: "Durée", value: "inconnue" },
      { label: "Format", value: "inconnu" },
      { label: "Poids téléchargé par la page", value: "non téléchargé par la page" },
    ]);
  });

  it("treats a zero resolution as unknown and keeps a 0 ko weight", () => {
    const rows = mediaInfoRows(subject({ downloadedBytes: 0 }), { duration: 1, width: 0, height: 0 });
    expect(rows[0].value).toBe("inconnue");
    expect(rows[3].value).toBe(formatKo(0));
  });
});

describe("strings", () => {
  it("has the exact wording", () => {
    expect(mediaAccessibleName("intro.mp4")).toBe("Aperçu de intro.mp4");
    expect(VIDEO_NOT_DISPLAYED_HINT).toBe("Vidéo non affichée sur la page");
    expect(mediaErrorMessage("unavailable")).toBe("Média indisponible.");
    expect(mediaErrorMessage("unsupported")).toBe("Ce format n'est pas lu par ce navigateur.");
  });
});

describe("mediaErrorKind", () => {
  it.each([
    [{ code: 3 }, "unsupported"],
    [{ code: 3, recordedStatus: 404 }, "unsupported"],
    [{ code: 4, recordedStatus: 200 }, "unsupported"],
    [{ code: 4, recordedStatus: 206 }, "unsupported"],
    [{ code: 4, recordedStatus: 304 }, "unsupported"],
    [{ code: 4, recordedStatus: 404 }, "unavailable"],
    [{ code: 4, recordedStatus: 500 }, "unavailable"],
    [{ code: 4 }, "unavailable"],
    [{ code: 2, recordedStatus: 200 }, "unavailable"],
    [{ code: 1 }, "unavailable"],
    [{}, "unavailable"],
  ] as const)("%j gives %s", (input, expected) => {
    expect(mediaErrorKind(input)).toBe(expected);
  });
});
