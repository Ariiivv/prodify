import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ──────────────────────────────────────────────────────────────────────
// Unified Deep Flow / Deep Work Ratio (shared across backend & frontend)
// ──────────────────────────────────────────────────────────────────────
/**
 * Deep Flow % = max(0, min(100, round(
 *   100 - (distraction_count × 4.5)
 *         - (distracted_seconds / max(1, focus_seconds) × 100)
 * , 1)))
 *
 * Zero-state fallback: if focus_seconds === 0 and distraction_count === 0,
 * returns 100% (pristine/calibrating state), never 0% for clean sessions.
 */
export function computeDeepFlowRatio(
  focusSeconds: number,
  distractedSeconds: number,
  distractionCount: number = 0,
): number {
  const focusSec = Math.max(0, Number(focusSeconds) || 0)
  const distractedSec = Math.max(0, Number(distractedSeconds) || 0)
  const distractionCnt = Math.max(0, Number(distractionCount) || 0)

  // Zero-state fallback: clean session with no focus tracked yet → pristine 100%
  if (focusSec === 0 && distractionCnt === 0) {
    return 100
  }

  const raw =
    100 -
    distractionCnt * 4.5 -
    (distractedSec / Math.max(1, focusSec)) * 100

  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10))
}

// ──────────────────────────────────────────────────────────────────────
// Unified Daily Session Count (shared across backend & frontend)
// ──────────────────────────────────────────────────────────────────────
/**
 * Total Daily Sessions = max(1, ceil(Daily Quota Minutes / Work Duration Minutes))
 *
 * Paused or completed tracks return 0 sessions (no active quota).
 */
export function computeTotalDailySessions(
  dailyQuotaMinutes: number,
  workDurationMinutes: number,
  workspaceStatus: string = "active",
): number {
  const status = (workspaceStatus || "active").toLowerCase()
  if (status === "paused" || status === "completed") {
    return 0
  }

  const quota = Number(dailyQuotaMinutes) || 0
  const duration = Number(workDurationMinutes) || 0

  if (quota <= 0 || duration <= 0) {
    return 0
  }

  return Math.max(1, Math.ceil(quota / duration))
}
