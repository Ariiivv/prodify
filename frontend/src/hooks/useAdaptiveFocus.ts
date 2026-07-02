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
  onDistracted?: () => void;
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

  /**
   * Core focus-checking logic.
   * Called both from the Electron IPC handler and the browser fallback polling.
   */
  const checkFocus = useCallback((title: string) => {
    // Safety check: only trigger focus events when the timer is actively running.
    // If the timer is idle, paused, or on break, we suppress distraction events
    // to avoid false alarms during setup or breaks.
    const timer = getTimerState();
    const isFocusActive = timer.currentState === 'FOCUS_RUNNING';

    // Update the displayed title regardless
    setCurrentTabTitle(title);

    // Perform the keyword match
    const focused = isFocused(title, keywords);
    setFocusedState(focused);

    // Only fire callbacks when:
    //   1. Focus state actually changed
    //   2. The timer is in an active focus-running state (safety check)
    if (focused !== prevFocusedRef.current) {
      prevFocusedRef.current = focused;

      // Suppress callback firing when timer isn't actively running
      if (!isFocusActive) return;

      if (focused) {
        onFocused?.();
      } else {
        onDistracted?.();
      }
    }
  }, [keywords, onDistracted, onFocused]);

  useEffect(() => {
    if (!enabled) {
      setFocusedState(true);
      return;
    }

    // ─── Electron Path ─────────────────────────────────────────────────────
    if (IS_ELECTRON && window.electronBridge) {
      // Start OS tracking
      window.electronBridge.setTrackingEnabled(true);

      // Get the initial active window
      window.electronBridge.getActiveWindow().then((win) => {
        if (win) {
          checkFocus(win.title);
        }
      });

      // Subscribe to OS window changes
      const unsubscribe = window.electronBridge.onWindowChanged((payload) => {
        checkFocus(payload.title);
      });

      return () => {
        unsubscribe();
        window.electronBridge?.setTrackingEnabled(false);
      };
    }

    // ─── Browser Fallback Path ─────────────────────────────────────────────
    // Check on mount using document.title
    checkFocus(document.title);

    // Poll for title changes (since document.title changes don't fire events reliably)
    const intervalId = setInterval(() => {
      checkFocus(document.title);
    }, 1000);

    // Also listen for focus/blur events on the window
    const handleFocus = () => checkFocus(document.title);
    window.addEventListener('focus', handleFocus);

    // Use MutationObserver as a backup for title changes
    const observer = new MutationObserver(() => checkFocus(document.title));
    observer.observe(document.querySelector('title') ?? document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      observer.disconnect();
    };
  }, [enabled, checkFocus]);

  return {
    currentTabTitle,
    isFocused: focusedState,
    keywords,
  };
}

export { isFocused };