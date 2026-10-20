# ARCH-DECISION-019: `NetworkRequest` gains `httpVersion` and `startedAt`, optional and persisted

- **Status:** Accepted (US-009, US-012)

## Context

- US-012 grades the share of HTTP/1.x requests. The protocol is in the HAR (`response.httpVersion`), with values that differ by browser (`http/2.0`, `h2`, `HTTP/2`, `h3-29`, …), but the normaliser drops it.
- US-009 compares `Expires` with the response `Date` header, "or with the request time when `Date` is missing". `evaluate` is pure and cannot read the clock. The request time is in the HAR (`startedDateTime`, an ISO 8601 string), and the normaliser drops it too.

## Decision

- `NetworkRequest.httpVersion?: HttpVersion` (`"1.0" | "1.1" | "2" | "3"`) and `NetworkRequest.startedAt?: number` (epoch milliseconds).
- Both are filled by `infra/har.ts` and are `undefined` when unknown or unparseable.
  - `normaliseHttpVersion(raw)` implements the US-012 table: case-insensitive; `h2`/`h2c`/`http/2`/`http/2.0` → `2`; `h3`/`h3-*`/`http/3` → `3`; anything else → undefined.
  - `startedAt` is a number, not a `Date`, so the store codec needs no rehydration.
- Both are persisted with the requests as they are. Analyses saved earlier have neither and load unchanged (US-012 scenario 8); their best practices are never recomputed (EPIC-BP2 §11).

## Consequences

- localStorage grows by about 30 bytes per request.
- US-009 without `Date` and without `startedAt` (legacy data only, never recomputed) treats any valid `Expires` HTTP-date as compliant: there is no reference time to compare with.
- MockBrowser and test fixtures may omit both fields.
