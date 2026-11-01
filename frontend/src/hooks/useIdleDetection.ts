import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** Whether the user has exceeded the configured inactivity threshold. */
  isIdle: boolean;
  /** Reset the inactivity clock and counters. */
  resetTimer: () => void;
  /** Time in ms since last keyboard or pointer activity. */
  idleTime: number;
  keystrokes: number;
  clicks: number;
}

export function useIdleDetection({ idleTimeout = 120000, enabled = true, onIdle, onActive }: IdleDetectionOptions = {}): IdleDetectionResult {
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [keystrokes, setKeystrokes] = useState(0);
  const [clicks, setClicks] = useState(0);
  const wasIdleRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);

  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);
  useEffect(() => { onActiveRef.current = onActive; }, [onActive]);

  const resetTimer = useCallback(() => {
    setLastActivityAt(Date.now());
    wasIdleRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetTimer();
      return;
    }

    const markKeyboard = () => {
      setLastActivityAt(Date.now());
      setKeystrokes(value => value + 1);
      if (wasIdleRef.current) {
        wasIdleRef.current = false;
        onActiveRef.current?.();
      }
    };
    const markPointer = () => {
      setLastActivityAt(Date.now());
      setClicks(value => value + 1);
      if (wasIdleRef.current) {
        wasIdleRef.current = false;
        onActiveRef.current?.();
      }
    };

    window.addEventListener('keydown', markKeyboard, { passive: true });
    window.addEventListener('pointerdown', markPointer, { passive: true });
    window.addEventListener('wheel', markPointer, { passive: true });
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('keydown', markKeyboard);
      window.removeEventListener('pointerdown', markPointer);
      window.removeEventListener('wheel', markPointer);
      window.clearInterval(interval);
    };
  }, [enabled, resetTimer]);

  const idleTime = enabled ? Math.max(0, now - lastActivityAt) : 0;
  const isIdle = enabled && idleTime >= idleTimeout;

  useEffect(() => {
    if (isIdle && !wasIdleRef.current) {
      wasIdleRef.current = true;
      onIdleRef.current?.();
    }
  }, [isIdle]);

  return { isIdle, resetTimer, idleTime, keystrokes, clicks };
}
