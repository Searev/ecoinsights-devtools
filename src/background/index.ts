import { RULES } from "../app/domain/best-practices";
import type { ChromeLike } from "./chrome-like";
import { createPageAgent } from "./page-agent";

createPageAgent({ chrome: chrome as unknown as ChromeLike, rules: RULES });
