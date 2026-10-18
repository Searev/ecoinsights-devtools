# ARCH-DECISION-002: Typed RPC protocol between panel and Page agent

- **Status:** Accepted (REFACTOR-001)
- **Supersedes:** `src/bridge/connexion.ts`

## Context

The previous bridge had several problems:

- It used numeric enums and an untyped `extra?: any`.
- It correlated responses to requests **by command type**, so two concurrent calls of the same kind received the same answer.
- It had no timeout and no error channel, so a missing permission left the UI on its loader forever.
- A `switch` sat on each side, and adding a capability touched 3 files with no compiler help.

## Decision

`src/shared/protocol.ts` defines:

- `AgentRequests`, a map from method name to `{ params; result }`. Adding a capability starts by adding one line there.
- Request messages carry a unique `id` and the inspected `tabId`. Responses are `{ ok: true, result }` or `{ ok: false, error: { code, message } }`.
- Push events (`NavigationEvent`) as a separate message type.
- `ProbeMessage` for the content-script channel, with a type guard.
- Client-side timeouts: 5 s, or 30 s for `page.reload`. Rejection uses `AgentError` with a typed `code`.

The Page agent implements a `handlers` object typed as `{ [M in AgentMethod]: (tabId, params) => Promise<AgentResult<M>> }`, so a missing handler is a compile error.

## Consequences

- Both ends are type-checked against one file.
- The UI can show a permission or timeout error instead of hanging.
- Everything in the protocol must stay JSON-serialisable. In particular, functions cannot cross the port, which is why rules are referenced **by id** in `page.collect` (ARCH-DECISION-004).
