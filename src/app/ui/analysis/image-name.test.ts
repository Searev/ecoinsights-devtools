import { describe, expect, it } from "vitest";
import { displayImageName } from "./image-name";

const at = (file: string) => `https://cdn.example.org/img/${file}`;

describe("displayImageName: story table", () => {
  const rows: Array<[string, string, string]> = [
    [
      "962c01_upload-1-c02rkcjxsn76-frame-1-22.jpeg",
      "962c01_uploa...6-frame-1-22.jpeg",
      "962c01_upload-1-c02rkcjxsn76-frame-1-22.jpeg",
    ],
    ["photo.jpg", "photo.jpg", "photo.jpg"],
    ["exactly-twenty-four-char.png", "exactly-twenty-four-char.png", "exactly-twenty-four-char.png"],
    ["abcdefghijklmnopqrstuvwxyz.webp", "abcdefghijkl...opqrstuvwxyz.webp", "abcdefghijklmnopqrstuvwxyz.webp"],
    [
      "a-very-long-file-name-without-any-extension",
      "a-very-long-...ny-extension",
      "a-very-long-file-name-without-any-extension",
    ],
    ["archive.tar.gz", "archive.tar.gz", "archive.tar.gz"],
    [
      "photo%20de%20vacances%20%C3%A0%20la%20plage%202024.jpg",
      "photo de vac...a plage 2024.jpg",
      "photo de vacances à la plage 2024.jpg",
    ],
  ];
  it.each(rows)("%s", (file, short, full) => {
    expect(displayImageName(at(file))).toEqual({ short, full });
  });

  it("uses the host name when there is no file segment", () => {
    expect(displayImageName("https://cdn.example.org/?id=3")).toEqual({
      short: "cdn.example.org",
      full: "cdn.example.org",
    });
  });
});

describe("displayImageName: scenarios", () => {
  it("S2: drops the query string and fragment", () => {
    expect(displayImageName("https://example.org/photo.jpg?v=3#top")).toEqual({
      short: "photo.jpg",
      full: "photo.jpg",
    });
  });

  it("S3: keeps a stem of 24 and shortens a stem of 25", () => {
    const s24 = "a".repeat(12) + "b".repeat(12);
    expect(displayImageName(at(`${s24}.png`)).short).toBe(`${s24}.png`);
    const s25 = "a".repeat(12) + "m" + "b".repeat(12);
    expect(displayImageName(at(`${s25}.png`))).toEqual({
      short: `${"a".repeat(12)}...${"b".repeat(12)}.png`,
      full: `${s25}.png`,
    });
  });

  it("S6: uses the raw segment when decoding fails", () => {
    expect(() => displayImageName(at("bad%E0%A4%A.jpg"))).not.toThrow();
    expect(displayImageName(at("bad%E0%A4%A.jpg"))).toEqual({
      short: "bad%E0%A4%A.jpg",
      full: "bad%E0%A4%A.jpg",
    });
  });

  it("S7: ignores the port and takes the last non-empty segment", () => {
    expect(displayImageName("https://cdn.example.org:8443/").short).toBe("cdn.example.org");
    expect(displayImageName("https://cdn.example.org/a/b.png/").short).toBe("b.png");
  });

  it("falls back to a path when the input is not an absolute URL", () => {
    expect(displayImageName("/media/x.png?a=1#f")).toEqual({ short: "x.png", full: "x.png" });
  });
});

describe("displayImageName: extension rules", () => {
  it("treats a leading dot as no extension", () => {
    const stem = ".htaccess" + "x".repeat(30);
    const { short } = displayImageName(at(stem));
    expect(short).toBe(`${stem.slice(0, 12)}...${stem.slice(-12)}`);
  });

  it("ignores an extension longer than 5 characters", () => {
    const name = "file." + "x".repeat(30) + ".toolongext";
    const { short } = displayImageName(at(name));
    expect(short.endsWith("...xtoolongext")).toBe(false);
    expect(short).toBe(`${name.slice(0, 12)}...${name.slice(-12)}`);
  });

  it("keeps the case of the extension", () => {
    const stem = "S".repeat(30);
    expect(displayImageName(at(`${stem}.JPG`)).short).toBe(`${"S".repeat(12)}...${"S".repeat(12)}.JPG`);
    expect(displayImageName(at("IMG.JPG")).short).toBe("IMG.JPG");
  });

  it("handles a short name ending with a dot", () => {
    expect(displayImageName(at("weird.")).short).toBe("weird.");
  });
});

describe("displayImageName: S8 characters are never split", () => {
  const FLAG = "\u{1F1EB}\u{1F1F7}";
  const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";
  const ACCENT = "é";

  /** The whole sequence appears, or none of its code points does. */
  const wholeOrNone = (short: string, seq: string) => {
    if (short.includes(seq)) return true;
    return !Array.from(seq).some((cp) => short.includes(cp));
  };

  for (const [label, seq] of [["flag", FLAG], ["ZWJ family", FAMILY], ["combining accent", ACCENT]] as const) {
    for (const before of [10, 11, 12]) {
      it(`${label} after ${before} characters`, () => {
        const stem = "a".repeat(before) + seq + "z".repeat(30);
        const { short, full } = displayImageName(at(`${stem}.png`));
        expect(full).toBe(`${stem}.png`);
        expect(wholeOrNone(short, seq)).toBe(true);
        expect(short.endsWith(".png")).toBe(true);
        expect(short.includes("...")).toBe(true);
      });
    }
  }

  it("counts a sequence as one character in the head", () => {
    const stem = "a".repeat(11) + FLAG + "b".repeat(20);
    expect(displayImageName(at(`${stem}.png`)).short).toBe(`${"a".repeat(11)}${FLAG}...${"b".repeat(12)}.png`);
  });

  it("counts a sequence as one character in the tail", () => {
    const stem = "a".repeat(20) + FAMILY + "b".repeat(11);
    expect(displayImageName(at(`${stem}.png`)).short).toBe(`${"a".repeat(12)}...${FAMILY}${"b".repeat(11)}.png`);
  });

  it("glues skin tone modifiers, variation selectors and tags", () => {
    const wave = "\u{1F44B}\u{1F3FD}";
    const heart = "❤️";
    const tagged = "\u{1F3F4}\u{E0067}\u{E0062}\u{E007F}";
    for (const seq of [wave, heart, tagged]) {
      const stem = "a".repeat(11) + seq + "z".repeat(30);
      expect(wholeOrNone(displayImageName(at(`${stem}.png`)).short, seq)).toBe(true);
    }
  });

  it("pairs regional indicators two by two", () => {
    const flags = FLAG + FLAG; // 4 indicators = 2 characters
    const stem = "a".repeat(10) + flags + "z".repeat(30);
    expect(displayImageName(at(`${stem}.png`)).short).toBe(`${"a".repeat(10)}${flags}...${"z".repeat(12)}.png`);
  });

  it("does not shorten a name whose stem is 24 characters with sequences", () => {
    const stem = FLAG.repeat(12); // 12 characters, 24 code points
    expect(displayImageName(at(`${stem}.png`)).short).toBe(`${stem}.png`);
  });
});

describe("displayImageName: performance", () => {
  it("handles a very long name in linear time", () => {
    const name = "x".repeat(200_000) + ".png";
    const start = performance.now();
    const { short } = displayImageName(at(name));
    expect(performance.now() - start).toBeLessThan(500);
    expect(short).toBe(`${"x".repeat(12)}...${"x".repeat(12)}.png`);
  });
});
