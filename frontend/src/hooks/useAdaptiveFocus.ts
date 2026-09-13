import { useState, useEffect, useCallback, useRef } from 'react';
import { getTimerState } from '@/lib/timerStore';

// ─── Environment Detection ───────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronBridge;

/**
 * Determines if the current OS window title is focused based on the workspace keywords.
 * Implements a strict whitelist: the user is FOCUSED only if the current title
 * contains at least one keyword (case-insensitive).
 * - Empty/null title defaults to focused (avoids false positives).
 * - Empty keywords array defaults to focused (presentation bypass / demo guardrail).
 * - All keywords are trimmed and empty strings are filtered out before comparison.
 */
function isFocused(currentTitle: string, keywords: string[]): boolean {
  // Guard: no keywords provided → always focused (demo guardrail)
  if (!keywords || keywords.length === 0) return true;

  // Guard: empty/null title → focused to avoid false positives
  if (!currentTitle || currentTitle.trim().length === 0) return true;

  // Sanitize keywords: trim and remove empties
  const sanitized = keywords
    .map(kw => kw.trim())
    .filter(kw => kw.length > 0);
  if (sanitized.length === 0) return true;

  // Whitelist check: title must contain at least one keyword (case-insensitive)
  const lowerTitle = currentTitle.toLowerCase();
  const matchFound = sanitized.some(kw => lowerTitle.includes(kw.toLowerCase()));

  console.log(
    `[useAdaptiveFocus] Current Title: "${currentTitle}", Keywords: [${sanitized.join(', ')}], MatchFound: ${matchFound}`
  );

  return matchFound;
}

interface UseAdaptiveFocusOptions {
  /** Array of focus keywords from the workspace */
  keywords: string[];
  /** Whether adaptive tracking is enabled */
  enabled: boolean;
  /** Called when the user becomes distracted */
  onDistracted?: (reason?: string, appName?: string) => void;
  /** Called when the user becomes focused */
  onFocused?: () => void;
}

interface UseAdaptiveFocusResult {
  /** Current OS window title (or document.title as fallback) */
  currentTabTitle: string;
  /** Whether the user is currently focused */
  isFocused: boolean;
  /** The list of keywords being checked */
  keywords: string[];
}

export function useAdaptiveFocus({
  keywords = [],
  enabled = true,
  onDistracted,
  onFocused,
}: UseAdaptiveFocusOptions): UseAdaptiveFocusResult {
  const [currentTabTitle, setCurrentTabTitle] = useState(
    () => IS_ELECTRON ? '' : document.title
  );
  const [focusedState, setFocusedState] = useState(true);
  const prevFocusedRef = useRef(true);
  const onDistractedRef = useRef(onDistracted);
  const onFocusedRef = useRef(onFocused);
  const keywordsRef = useRef(keywords);

  useEffect(() => {
    onDistractedRef.current = onDistracted;
    onFocusedRef.current = onFocused;
    keywordsRef.current = keywords;
  }, [onDistracted, onFocused, keywords]);

  // ── Startup grace period ─────────────────────────────────────────────
  // Ignore all distraction callbacks for the first 3 seconds after the
  // hook is enabled. This gives the Electron polling time to sync up
  // cleanly after "Start Timer" or "Resume Focus" is clicked.
  const startupTimeRef = useRef<number>(Date.now());
  const prevEnabledRef = useRef<boolean>(enabled);
  const GRACE_PERIOD_MS = 3000;

  // Reset grace period and reset focused ref whenever transitioning
  // from disabled → enabled (i.e. user clicks "Start Timer" or "Resume Focus").
  if (enabled && !prevEnabledRef.current) {
    startupTimeRef.current = Date.now();
    prevFocusedRef.current = true;
    console.log(`[useAdaptiveFocus] ⏳ Grace period timer RESET at ${startupTimeRef.current}`);
  }
  prevEnabledRef.current = enabled;

  /**
   * Core focus-checking logic.
   * Called both from the Electron IPC handler and the browser fallback polling.
   */
  const checkFocus = useCallback((title: string, overrideFocused?: boolean, reason?: string, appName?: string) => {
    // Safety check: only trigger focus events when the timer is actively running.
    const timer = getTimerState();
    const isFocusActive = timer.currentState === 'FOCUS_RUNNING';

    // Update the displayed title regardless
    if (title) {
      setCurrentTabTitle(title);
    }

    // Perform the keyword match or use AI Intent Engine override
    const focused = overrideFocused !== undefined ? overrideFocused : isFocused(title, keywordsRef.current);
    setFocusedState(focused);

    // Suppress callback firing when timer isn't actively running
    if (!isFocusActive) return;

    // ── Startup grace period ─────────────────────────────────────────
    const elapsed = Date.now() - startupTimeRef.current;
    if (!focused && elapsed < GRACE_PERIOD_MS) {
      console.log(`[useAdaptiveFocus] ⏳ Grace period active (${elapsed}ms / ${GRACE_PERIOD_MS}ms) — suppressing distraction for title="${title}"`);
      return;
    }

    // Always halt the timer immediately if a distraction is detected while FOCUS_RUNNING
    if (!focused) {
      prevFocusedRef.current = false;
      onDistractedRef.current?.(reason, appName);
    } else if (focused !== prevFocusedRef.current) {
      prevFocusedRef.current = true;
      onFocusedRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setFocusedState(true);
      prevFocusedRef.current = true;
      return;
    }

    // ─── Electron Path ─────────────────────────────────────────────────────
    if (IS_ELECTRON && window.electronBridge) {
      // Start OS tracking
      window.electronBridge.setTrackingEnabled(true);

      // Get initial window title for UI display
      window.electronBridge.getActiveWindow().then((win) => {
        if (win) {
          setCurrentTabTitle(win.title);
        }
      });

      // Subscribe to OS window changes for fast UI title display
      const unsubscribeWindow = window.electronBridge.onWindowChanged((payload) => {
        setCurrentTabTitle(payload.title);
      });

      // Subscribe to backend AI Intent Engine classification results
      const unsubscribeClassified = window.electronBridge.onActivityClassified
        ? window.electronBridge.onActivityClassified((payload) => {
            console.log(`[useAdaptiveFocus] ⚡ IPC received activity-classified: status="${payload.status}", reason="${payload.reason}"`);
            checkFocus(payload.window_title, payload.status === 'focused', payload.reason, payload.app_name);
          })
        : () => {};

      return () => {
        unsubscribeWindow();
        unsubscribeClassified();
        window.electronBridge?.setTrackingEnabled(false);
      };
    }

    // ─── Browser Fallback Path ─────────────────────────────────────────────
    // If not running in Electron, we cannot track OS-level windows.
    // We intentionally disable title-based keyword checking in the browser to prevent 
    // false positives when the user switches to VS Code or another app.
    console.log("[useAdaptiveFocus] Running in browser: OS window tracking is disabled.");
    
    return () => {};
  }, [enabled, checkFocus]);

  return {
    currentTabTitle,
    isFocused: focusedState,
    keywords,
  };
}

export { isFocused };