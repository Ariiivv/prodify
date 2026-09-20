import { useState, useEffect, useCallback, useRef } from 'react';
import { getTimerState } from '@/lib/timerStore';
import { API_BASE, getAuthHeaders } from '@/lib/config';

// ─── Environment Detection ───────────────────────────────────────────────────
const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

interface UseAdaptiveFocusOptions {
  /** Array of focus keywords from the workspace (used as local fallback) */
  keywords: string[];
  /** Whether adaptive tracking is enabled */
  enabled: boolean;
  /** The user's natural-language session intent for AI classification */
  sessionIntent?: string;
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
  sessionIntent = '',
  onDistracted,
  onFocused,
}: UseAdaptiveFocusOptions): UseAdaptiveFocusResult {
  const [currentTabTitle, setCurrentTabTitle] = useState('');
  const [focusedState, setFocusedState] = useState(true);
  const prevFocusedRef = useRef(true);
  const onDistractedRef = useRef(onDistracted);
  const onFocusedRef = useRef(onFocused);
  const sessionIntentRef = useRef(sessionIntent);
  // Track in-flight classification to avoid duplicate API calls
  const classifyingRef = useRef(false);
  const pendingWindowRef = useRef<{title: string, processName: string} | null>(null);

  useEffect(() => {
    onDistractedRef.current = onDistracted;
    onFocusedRef.current = onFocused;
    sessionIntentRef.current = sessionIntent;
  }, [onDistracted, onFocused, sessionIntent]);

  // 🛡️ Startup grace period 🛡️
  const startupTimeRef = useRef<number>(Date.now());
  const prevEnabledRef = useRef<boolean>(enabled);
  const GRACE_PERIOD_MS = 3000;

  if (enabled && !prevEnabledRef.current) {
    startupTimeRef.current = Date.now();
    prevFocusedRef.current = true;
    console.log(`[useAdaptiveFocus] ⏳ Grace period timer RESET at ${startupTimeRef.current}`);
  }
  prevEnabledRef.current = enabled;

  /**
   * Core focus-checking logic.
   * Called with the AI classification result from the backend.
   */
  const checkFocus = useCallback((title: string, overrideFocused?: boolean, reason?: string, appName?: string) => {
    const timer = getTimerState();
    const isFocusActive = timer.currentState === 'FOCUS_RUNNING';

    if (title) {
      setCurrentTabTitle(title);
    }

    const focused = overrideFocused !== undefined ? overrideFocused : true;
    setFocusedState(focused);

    if (!isFocusActive) return;

    // 🛡️ Startup grace period 🛡️
    const elapsed = Date.now() - startupTimeRef.current;
    if (!focused && elapsed < GRACE_PERIOD_MS) {
      console.log(`[useAdaptiveFocus] 🛡️ Grace period active (${elapsed}ms / ${GRACE_PERIOD_MS}ms) – suppressing distraction for title="${title}"`);
      return;
    }

    if (!focused) {
      prevFocusedRef.current = false;
      onDistractedRef.current?.(reason, appName);
    } else if (focused !== prevFocusedRef.current) {
      prevFocusedRef.current = true;
      onFocusedRef.current?.();
    }
  }, []);

  /**
   * Send the window title to the backend for AI-powered intent classification.
   * Calls POST /api/telemetry/activity and feeds the result into checkFocus().
   */
  const classifyWindow = useCallback(async (initialTitle: string, initialProcessName: string) => {
    // If a request is already running, queue this window to be processed next.
    // This ensures we never drop the user's latest window if they tab-switch rapidly.
    if (classifyingRef.current) {
      pendingWindowRef.current = { title: initialTitle, processName: initialProcessName };
      return;
    }
    classifyingRef.current = true;

    let currentTitle = initialTitle;
    let currentProcessName = initialProcessName;

    while (true) {
      try {
        const response = await fetch(`${API_BASE}/api/telemetry/activity`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            window_title: currentTitle,
            app_name: currentProcessName,
            intent: sessionIntentRef.current || '',
          }),
        });

        if (!response.ok) {
          console.error(`[useAdaptiveFocus] /telemetry/activity HTTP ${response.status}`);
          // On error, don't change focus state (fail-open)
          setCurrentTabTitle(currentTitle);
        } else {
          const data: { status: string; reason: string; window_title: string; app_name: string } =
            await response.json();

          console.log(
            `[useAdaptiveFocus] 🧠 Classification result: status="${data.status}", reason="${data.reason}"`
          );

          checkFocus(currentTitle, data.status === 'focused', data.reason, data.app_name);
        }
      } catch (err) {
        console.error('[useAdaptiveFocus] Classification request failed:', err);
        // Fail-open: just update the title, don't trigger distraction
        setCurrentTabTitle(currentTitle);
      }

      // Check if a new window was queued while we were fetching
      if (pendingWindowRef.current) {
        currentTitle = pendingWindowRef.current.title;
        currentProcessName = pendingWindowRef.current.processName;
        pendingWindowRef.current = null;
      } else {
        classifyingRef.current = false;
        break;
      }
    }
  }, [checkFocus]);

  useEffect(() => {
    if (!enabled) {
      setFocusedState(true);
      prevFocusedRef.current = true;
      return;
    }

    // ─── Tauri Path ──────────────────────────────────────────────────────
    if (IS_TAURI) {
      let unlisten: (() => void) | null = null;

      const setup = async () => {
        try {
          // Dynamic imports — these modules only exist in a Tauri runtime
          const { invoke } = await import('@tauri-apps/api/core');
          const { listen } = await import('@tauri-apps/api/event');

          // Get the initial active window
          const initial = await invoke<{
            title: string;
            processName: string;
            timestamp: number;
          } | null>('get_active_window');

          if (initial) {
            setCurrentTabTitle(initial.title);
            // Classify the initial window (if intent is set)
            if (sessionIntentRef.current) {
              classifyWindow(initial.title, initial.processName);
            }
          }

          // Subscribe to window-changed events from the Rust background poller
          const unlistenFn = await listen<{
            title: string;
            processName: string;
            timestamp: number;
          }>('window-changed', (event) => {
            const { title, processName } = event.payload;
            console.log(
              `[useAdaptiveFocus] 🪟 Window changed: "${title}" (${processName})`
            );

            // Always update the displayed title
            setCurrentTabTitle(title);

            // Only classify if the hook is enabled and we have an intent
            if (sessionIntentRef.current) {
              classifyWindow(title, processName);
            }
          });

          unlisten = unlistenFn;
        } catch (err) {
          console.error('[useAdaptiveFocus] Tauri setup failed:', err);
        }
      };

      setup();

      return () => {
        unlisten?.();
      };
    }

    // ─── Browser Fallback Path ─────────────────────────────────────────────
    // If not running in Tauri, we cannot track OS-level windows.
    console.log("[useAdaptiveFocus] Running in browser: OS window tracking is disabled.");

    return () => {};
  }, [enabled, classifyWindow]);

  return {
    currentTabTitle,
    isFocused: focusedState,
    keywords,
  };
}