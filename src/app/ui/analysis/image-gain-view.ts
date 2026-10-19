import { PageAnalysis } from "../../domain/models/page-analysis";
import {
  PageImageGain,
  imageGainStatus,
} from "../../domain/models/image-estimation";

export interface AnalysisImageGain {
  bytes: number;
  /** True when at least one page still has pending estimations: `bytes` is a lower bound. */
  pending: boolean;
  notEvaluatedCount: number;
  fallbackCount: number;
}

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 1 kB = 1 000 bytes. Under 1 000 kB after rounding: "204 ko"; else "1,2 Mo". */
export function formatGainBytes(bytes: number): string {
  const kilobytes = Math.round(bytes / 1000);
  if (kilobytes < 1000) return `${integer.format(kilobytes)} ko`;
  return `${oneDecimal.format(bytes / 1_000_000)} Mo`;
}

export function pageTransferBytes(page: PageAnalysis): number {
  return page.requests.reduce((acc, el) => acc + (el.transferSize ?? 0), 0);
}

function notEvaluatedLabel(count: number): string {
  return count === 1 ? "1 image non évaluée" : `${count} images non évaluées`;
}

/** Image gain line of one page. "—" for pages without gain (saved before US-003). */
export function describePageImageGain(
  gain: PageImageGain | undefined,
  pageTransferBytes: number
): string {
  if (gain === undefined) return "—";
  const status = imageGainStatus(gain);
  if (status === "pending") {
    return `≥ ${formatGainBytes(gain.bytes)} (estimation en cours)`;
  }
  let text = formatGainBytes(gain.bytes);
  if (gain.notEvaluatedCount > 0) {
    text += ` (${notEvaluatedLabel(gain.notEvaluatedCount)})`;
  } else if (gain.fallbackCount > 0) {
    text += " (partiel)";
  }
  if (pageTransferBytes > 0) {
    const share = Math.round((gain.bytes / pageTransferBytes) * 100);
    text += `, soit ${share} % du poids de la page`;
  }
  return text;
}

/** Sums the gain of the pages that have one; legacy pages are ignored. */
export function sumAnalysisImageGain(
  pages: readonly PageAnalysis[]
): AnalysisImageGain | undefined {
  let total: AnalysisImageGain | undefined;
  for (const page of pages) {
    const gain = page.imageGain;
    if (gain === undefined) continue;
    total ??= { bytes: 0, pending: false, notEvaluatedCount: 0, fallbackCount: 0 };
    total.bytes += gain.bytes;
    total.pending ||= gain.pendingCount > 0;
    total.notEvaluatedCount += gain.notEvaluatedCount;
    total.fallbackCount += gain.fallbackCount;
  }
  return total;
}

export function describeAnalysisImageGain(
  total: AnalysisImageGain | undefined
): string {
  if (total === undefined) return "—";
  if (total.pending) {
    return `≥ ${formatGainBytes(total.bytes)} (estimation en cours)`;
  }
  return formatGainBytes(total.bytes);
}
