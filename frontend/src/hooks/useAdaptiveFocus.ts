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
  /** The ID of the current workspace */
  workspaceId?: number | null;
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
  workspaceId = null,
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
  const workspaceIdRef = useRef<number | null>(null);

  const lastClassifiedRef = useRef<string>('');
  // New refs for strict target isolation
  const activeWindowRef = useRef<{ title: string; processName: string } | null>(null);
  const whitelistedWindowsRef = useRef<Set<string>>(new Set());

  const markAsRelevant = useCallback(() => {
    const titleToWhitelist = activeWindowRef.current?.title || currentTabTitle;
    if (titleToWhitelist) {
      whitelistedWindowsRef.current.add(titleToWhitelist.toLowerCase());
      // Re-evaluate immediately to flush any stale UI state
      setFocusedState(true);
      prevFocusedRef.current = true;
      onFocusedRef.current?.();
    }
  }, [currentTabTitle]);

  useEffect(() => {
    onDistractedRef.current = onDistracted;
    onFocusedRef.current = onFocused;
    sessionIntentRef.current = sessionIntent;
    workspaceIdRef.current = workspaceId;
  }, [onDistracted, onFocused, sessionIntent, workspaceId]);

  // 🛡️ Startup grace period 🛡️
  const startupTimeRef = useRef<number>(Date.now());
  const prevEnabledRef = useRef<boolean>(enabled);
  const GRACE_PERIOD_MS = 3000;

  if (enabled && !prevEnabledRef.current) {
    startupTimeRef.current = Date.now();
    prevFocusedRef.current = true;
  }
  prevEnabledRef.current = enabled;

  /**
   * Core focus-checking logic.
   * Called with the AI classification result from the backend.
   */
  const checkFocus = useCallback((title: string, isFocused: boolean, reason?: string, appName?: string) => {
    const timer = getTimerState();
    const isFocusActive = timer.currentState === 'FOCUS_RUNNING';

    if (title) {
      setCurrentTabTitle(title);
    }

    // Force focus if user explicitly whitelisted this exact window
    if (whitelistedWindowsRef.current.has(title.toLowerCase())) {
      isFocused = true;
    }

    if (!isFocusActive) return;

    // 🛡️ Startup grace period 🛡️
    const elapsed = Date.now() - startupTimeRef.current;
    if (!isFocused && elapsed < GRACE_PERIOD_MS) {
      return;
    }

    if (isFocused) {
      setFocusedState(true);
      if (!prevFocusedRef.current) {
        prevFocusedRef.current = true;
        onFocusedRef.current?.();
      }
    } else {
      console.debug(`[useAdaptiveFocus] DISTRACTED: "${title}" (${appName})`);
      setFocusedState(false);
      prevFocusedRef.current = false;
      onDistractedRef.current?.(reason, appName);
    }
  }, []);

  /**
   * Send the window title to the backend for AI-powered intent classification.
   */
  const classifyWindow = useCallback(async (initialTitle: string, initialProcessName: string) => {
    if (classifyingRef.current) {
      pendingWindowRef.current = { title: initialTitle, processName: initialProcessName };
      return;
    }
    classifyingRef.current = true;

    let currentTitle = initialTitle;
    let currentProcessName = initialProcessName;

    while (true) {
      try {
        const payload: any = {
          window_title: currentTitle,
          app_name: currentProcessName,
          intent: sessionIntentRef.current || '',
        };
        if (workspaceIdRef.current) {
          payload.workspace_id = workspaceIdRef.current;
        }

        const response = await fetch(`${API_BASE}/api/telemetry/activity`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.error(`[useAdaptiveFocus] Backend classification failed: HTTP ${response.status} for "${currentTitle}"`);
          setCurrentTabTitle(currentTitle);
        } else {
          const data: { status: string; reason: string; window_title: string; app_name: string } =
            await response.json();
            
          // Strict isolation: only apply result if the user is STILL on that window
          const isStillActive = !activeWindowRef.current || 
             (activeWindowRef.current.title === currentTitle && activeWindowRef.current.processName === currentProcessName);
             
          if (isStillActive) {
            checkFocus(currentTitle, data.status === 'focused', data.reason, data.app_name);
          } else {
             console.debug(`[useAdaptiveFocus] Ignored stale classification for "${currentTitle}" - window changed`);
          }
        }
      } catch (err) {
        console.error('[useAdaptiveFocus] Classification request failed:', err);
        setCurrentTabTitle(currentTitle);
      }

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
      let isMounted = true;
      let unlisten: (() => void) | null = null;
      let heartbeatId: NodeJS.Timeout | null = null;

      const setup = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const { listen } = await import('@tauri-apps/api/event');

          const pollActiveWindow = async () => {
            if (!isMounted) return;
            try {
              const active = await invoke<{
                title: string;
                processName: string;
                timestamp: number;
              } | null>('get_active_window');

              if (active) {
                const key = `${active.processName}::${active.title}`;
                activeWindowRef.current = { title: active.title, processName: active.processName };
                setCurrentTabTitle(active.title);

                // Skip re-classification if the window hasn't changed (heartbeat dedup)
                if (key === lastClassifiedRef.current) return;
                lastClassifiedRef.current = key;
                
                if (whitelistedWindowsRef.current.has(active.title.toLowerCase())) {
                   checkFocus(active.title, true, "Marked as relevant", active.processName);
                } else {
                  classifyWindow(active.title, active.processName);
                }
              }
            } catch (e) {
              console.error("[useAdaptiveFocus] poll error:", e);
            }
          };

          await pollActiveWindow();
          heartbeatId = setInterval(pollActiveWindow, 1000);

          const unlistenFn = await listen<{
            title: string;
            processName: string;
            timestamp: number;
          }>('window-changed', (event) => {
            if (!isMounted) return;
            const { title, processName } = event.payload;
            console.debug(`[useAdaptiveFocus] 🪟 Window changed: "${title}" (${processName})`);

            activeWindowRef.current = { title, processName };
            setCurrentTabTitle(title);

            if (whitelistedWindowsRef.current.has(title.toLowerCase())) {
               checkFocus(title, true, "Marked as relevant", processName);
            } else {
              classifyWindow(title, processName);
            }
          });

          if (!isMounted) {
            unlistenFn();
          } else {
            unlisten = unlistenFn;
          }
        } catch (err) {
          console.error('[useAdaptiveFocus] Tauri setup failed:', err);
        }
      };

      setup();

      return () => {
        isMounted = false;
        if (unlisten) unlisten();
        if (heartbeatId) clearInterval(heartbeatId);
      };
    }

    return () => {};
  }, [enabled, classifyWindow, checkFocus]);

  return {
    currentTabTitle,
    isFocused: focusedState,
    keywords,
    markAsRelevant,
  };
}