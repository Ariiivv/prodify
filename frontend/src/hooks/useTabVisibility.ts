import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '../store/timerStore';

export function useTabVisibility(workspaceId?: number) {
  const [isVisible, setIsVisible] = useState(true);
  const [enforcementTriggered, setEnforcementTriggered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => {
      const hidden = document.visibilityState === 'hidden';
      setIsVisible(!hidden);

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
            fetch('http://localhost:8000/api/telemetry/distraction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workspace_id: activeWs,
                distraction_type: 'TAB_SWITCH',
                timestamp: new Date().toISOString()
              }),
            });
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
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const store = useTimerStore.getState();
  const activeWs = store.activeWorkspaceId;
  const wsState = activeWs !== null ? store.workspaces[activeWs] : null;
  const distractionCount = wsState?.distractionCount ?? 0;

  return { isVisible, distractionCount, enforcementTriggered, setEnforcementTriggered };
}
