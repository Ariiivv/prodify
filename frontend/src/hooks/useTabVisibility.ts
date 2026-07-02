import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '@/lib/timerStore';
import { API_BASE } from '@/lib/config';

interface UseTabVisibilityOptions {
  disabled?: boolean;
}

export function useTabVisibility(workspaceId?: number | UseTabVisibilityOptions, options?: UseTabVisibilityOptions) {
  // Support both (workspaceId?, options?) and (options?) signatures
  const opts: UseTabVisibilityOptions =
    typeof workspaceId === 'object' ? workspaceId : options ?? {};

  const [isVisible, setIsVisible] = useState(true);
  const [enforcementTriggered, setEnforcementTriggered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = () => {
      // Support both standard 'visibilitychange' and Safari 'pagehide'
      const hidden = document.visibilityState === 'hidden';
      setIsVisible(!hidden);

      if (opts.disabled) return; // Bypass tab-switch tracking

      const store = useTimerStore.getState();
      const activeWs = store.activeWorkspaceId;
      if (activeWs === null) return;

      const wsState = store.workspaces[activeWs];
      if (!wsState) return;

      if (hidden && wsState.currentState === 'FOCUS_RUNNING') {
        store.incrementDistraction();
        if (timerRef.current === null) {
          timerRef.current = setTimeout(() => {
            useTimerStore.getState().pauseFocus('TAB_SWITCH');
            setEnforcementTriggered(true);

            // Abort previous in-flight request if any, then fire new one
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            fetch(`${API_BASE}/api/telemetry/distraction`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workspace_id: activeWs,
                distraction_type: 'TAB_SWITCH',
                timestamp: new Date().toISOString()
              }),
              signal: controller.signal,
            }).catch(() => {}); // Swallow abort errors silently
            timerRef.current = null;
          }, 15000);
        }
      } else if (!hidden) {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handler);
    // Safari bfcache fallback: pagehide fires even when navigating via bfcache
    window.addEventListener('pagehide', handler);

    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('pagehide', handler);
      abortRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [opts.disabled]);

  const store = useTimerStore.getState();
  const activeWs = store.activeWorkspaceId;
  const wsState = activeWs !== null ? store.workspaces[activeWs] : null;
  const distractionCount = wsState?.distractionCount ?? 0;

  return { isVisible, distractionCount, enforcementTriggered, setEnforcementTriggered };
}