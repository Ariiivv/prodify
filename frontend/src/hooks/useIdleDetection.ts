import { useCallback } from 'react';

export interface IdleDetectionOptions {
  /** Time in milliseconds before user is considered idle */
  idleTimeout?: number;
  /** Whether idle detection is enabled */
  enabled?: boolean;
  /** Callback fired when user becomes idle */
  onIdle?: () => void;
  /** Callback fired when user becomes active again */
  onActive?: () => void;
}

export interface IdleDetectionResult {
  /** Whether the user is currently idle (always false) */
  isIdle: boolean;
  /** Manual reset — no-op */
  resetTimer: () => void;
  /** Time in ms since last user activity */
  idleTime: number;
}

/**
 * Permanently deactivated: Inactivity / idle tracking has been removed.
 * Users reading documentation, watching educational videos, or studying
 * will never have their timers paused or interrupted for lack of mouse/keyboard movement.
 */
export function useIdleDetection(_options?: IdleDetectionOptions): IdleDetectionResult {
  const resetTimer = useCallback(() => {}, []);
  return { isIdle: false, resetTimer, idleTime: 0 };
}
