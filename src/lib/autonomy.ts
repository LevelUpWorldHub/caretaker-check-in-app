import type { Comparison } from "@/lib/types";
import { formatHm } from "@/lib/time";

export function autonomyText(comparison: Comparison): string {
  const morning = comparison.windows.find((window) => window.code === "morning_check");
  const clock = formatHm(new Date(comparison.asOf).getTime());
  if (morning?.status === "missed") {
    return `Watched the morning check at ${clock}. ${morning.detail} A gentle check-in is waiting for your approval. Nothing was sent.`;
  }
  if (morning?.status === "in_progress") {
    return `Watched the routine at ${clock}. The morning check is still open, so no check-in was drafted.`;
  }
  return `Watched the routine at ${clock}. Morning movement was already on the books, so no check-in was drafted.`;
}
