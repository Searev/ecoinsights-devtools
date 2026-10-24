# ARCH-DECISION-024: Text previews reuse the preview loader and store; raw bytes are cached, the UI decodes them; legacy minification lines are recognised from their text

- **Status:** Accepted (US-020)
- **Amends:** [ARCH-DECISION-020](ARCH-DECISION-020-preview-subjects-from-line-refs.md) (new `text` kind, legacy refs resolved from the line text), [022](ARCH-DECISION-022-preview-file-bytes.md) (`loadText`, `preview-text:` cache keys)
- **Does not change:** [ARCH-DECISION-018](ARCH-DECISION-018-text-content-analysis.md). The US-010 grade still reads DevTools content only; the re-download is for display.

## Context

US-020 makes the name of a `MinifyTextFiles` offender line ("non minifié") a preview button. The modal shows the file content, decoded with the response `charset` (else UTF-8), with "Poids" (byte length of the content obtained) and "Lignes". Its constraints:

- the content comes from DevTools, else a re-download from the HTTP cache, "exactly as the other previews do" (epic §5);
- it is kept in the session's shared 50 MB LRU, so a reopening is instant (scenario 13);
- the 25 MB preview cap applies ("Fichier trop volumineux pour être affiché.");
- analyses saved before the story must open their offender lines too (scenario 12). Their refs have no `preview`. Their "non évalué" lines, which also have refs, must stay plain text, and the rule and prefix alone cannot tell the two apart;
- nothing is persisted except `lineRefs.preview`.

Options considered for the bytes:

1. **A separate text loader and cache.** Rejected: a second copy of the DevTools-then-fetch logic, the cap and the streamed read, and a second memory budget against epic §5.
2. **Cache the decoded string.** Rejected: the session LRU is sized in bytes (`SessionFile.bytes`). A string has no byte size without encoding it, and the value types of the cache would diverge.
3. **A `loadText` method on the existing loader and a `text` method on the existing store; cache the raw bytes with the charset to decode them; decode in the UI (chosen).**

Options considered for legacy lines:

1. **Read the type from the recorded request.** Rejected alone: it does not tell an offender from a "non évalué" line of the same file type.
2. **Leave legacy lines plain.** Rejected: scenario 12 requires them to be clickable.
3. **Recognise the end of the line text (chosen).** US-010 lines are machine-written, with a fixed ending: `" (<type>, <weight>) : non minifié (~N % d'octets superflus)"`.

## Decision

- **Persisted data.** `LinePreview` gains `{ kind: "text"; type: TextPreviewType }`, where `TextPreviewType = TextFileType | "JSON"`. JSON is supported by the viewer for later rules; US-010 never flags it. `MinifyTextFiles` sets it on **offender lines only** (`fileLine(url, rest, "", { kind: "text", type })`). Its "non évalué" lines keep a ref without `preview`.
- **Subject** (`domain/models/file-preview.ts`): `TextPreviewSubject { kind: "text"; url; ruleId; fileType; declaredType; charset? }`.
  - `declaredType` is the last non-empty recorded MIME type, else "".
  - `charset` comes from the last recorded response `content-type` (`contentTypeCharset`).
- **Legacy refs.** `legacyLinePreview(ruleId, prefix, text?)` and the resolver `(ruleId, ref, text?)` take the line text. For `MinifyTextFiles`, an unprefixed ref whose text matches, at its end, `/ \((CSS|JS|HTML|SVG), [^()]*\) : non minifié \(~\d+ % d'octets superflus\)$/` is a text preview of the captured type. Anything else stays plain. The view passes each line's text to the resolver.
- **Port and adapter.**
  - `PreviewFileLoader.loadText(url, declaredType, charset?)` returns `PreviewFileResult<PreviewTextInfo>`, where `PreviewTextInfo = { byteLength; mimeType; charset }` and `charset` is the label the bytes must be decoded with.
  - **DevTools content first:**
    - with `encoding: "base64"`, or no encoding and a content that is entirely base64 (length a multiple of 4; the same rule as the US-010 analyser, so that one content is read one way), the bytes are decoded. Their charset is the subject's, else "utf-8";
    - otherwise the content is already decoded text: its UTF-8 encoding is the bytes, and the charset is "utf-8". "Poids" is then the UTF-8 length, close to the original size.
  - **Else the re-download** of 022: `fetch(url, { cache: "force-cache", credentials: "include" })`, a streamed read capped at `MAX_PREVIEW_BYTES`, and `too-large` without reading the body when `Content-Length` says so. The charset is the response's `charset` parameter, else the subject's, else "utf-8".
  - **Any bytes are accepted**, empty ones included ("Fichier vide."). The loader never rejects.
- **Store.** `PreviewFileStore.text(url, declaredType, charset?)` and `peekText(url)`, with keys prefixed `preview-text:`. It has the semantics of 022: in-flight loads are shared and complete after close, files are cached in the shared LRU, and errors are never cached ("Réessayer" retries for real).
- **Decoding** happens in the UI (`ui/analysis/preview/text-document.ts`). `TextDecoder(charset, { fatal: false })` turns invalid bytes into `�`, and an unknown label falls back to UTF-8. It runs on every opening, which is cheap next to rendering, so the cache holds one copy of each file.
- **Policy.** `MAX_PREVIEW_TEXT_CHARS = 500_000` (`domain/file-preview/policy.ts`) is the display cap. It is unrelated to `MAX_CONTENT_BYTES` (5 MB, the US-010 analysis cap) and to `MAX_PREVIEW_BYTES` (25 MB, the loading cap).

## Consequences

- No migration. Legacy offender lines become clickable; legacy "non évalué" lines stay plain.
- If US-010 ever changes the wording of its offender lines, the regex must follow, or legacy lines lose their button. New lines are unaffected, because they carry `preview`.
- The content shown may differ from the analysed version after a deployment. This is accepted by the story and not detected.
- A text file and an image with the same URL are cached under different keys. Both count towards the one 50 MB cap.
- The dev loader (`npm run dev`) returns synthetic, non-minified samples.
