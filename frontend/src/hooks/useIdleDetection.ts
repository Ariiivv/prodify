import { useEffect, useRef, useState, useCallback } from 'react';

interface IdleDetectionOptions {
  /** Time in milliseconds before user is considered idle (default: 60000 = 60s) */
  idleTimeout?: number;
  /** Whether idle detection is enabled */
  enabled?: boolean;
  /** Callback fired when user becomes idle */
  onIdle?: () => void;
  /** Callback fired when user becomes active again */
  onActive?: () => void;
}

interface IdleDetectionResult {
  /** Whether the user is currently idle */
  isIdle: boolean;
  /** Manual reset — call to reset the idle timer */
  resetTimer: () => void;
  /** Time in ms since last user activity */
  idleTime: number;
}

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Detects user idle state based on keyboard/mouse/touch activity.
 * If no activity is detected for `idleTimeout` ms, the user is flagged as idle.
 */
export function useIdleDetection(options?: IdleDetectionOptions): IdleDetectionResult {
  const {
    idleTimeout = 60000,
    enabled = true,
    onIdle,
    onActive,
  } = options || {};

  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep callback refs stable to avoid infinite loops
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  // Reset the idle timer — call this after a tab switch or any manual reset
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isIdleRef.current) {
      isIdleRef.current = false;
      setIsIdle(false);
      onActiveRef.current?.();
    }
  }, []);

  // Listen for user activity events — NO reactive state in deps to prevent infinite loops
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
        onActiveRef.current?.();
      }
    };

    // Attach listeners for all idle-resetting events
    IDLE_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Polling interval to check idle state without requiring frequent events
    idleTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleTimeout && !isIdleRef.current) {
        isIdleRef.current = true;
        setIsIdle(true);
        onIdleRef.current?.();
      }
    }, 1000); // Check every second

    return () => {
      IDLE_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [enabled, idleTimeout]); // <-- CRITICAL FIX: removed isIdle, onIdle, onActive from deps

  // Compute idle time for display
  const idleTime = Date.now() - lastActivityRef.current;

  return { isIdle, resetTimer, idleTime };
}