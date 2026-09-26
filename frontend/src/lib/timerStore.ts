import { create } from 'zustand';
import { audioEngine } from '@/lib/audio';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

const triggerDistractionAlert = async (reason: string) => {
  audioEngine.playDistractionAlert();
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (permissionGranted) {
      sendNotification({ title: 'Focus Paused', body: reason });
    }
  } catch (err) {
    console.error('Failed to send desktop notification:', err);
  }
};

type FSMState = 'IDLE' | 'FOCUS_RUNNING' | 'FOCUS_PAUSED' | 'BREAK_RUNNING' | 'BREAK_PAUSED' | 'SESSION_COMPLETED';

interface WorkspaceTimerState {
  currentState: FSMState;
  timeRemaining: number;
  pauseReason: string | null;
  sessionCount: number;
  distractionCount: number;
  intervalId: ReturnType<typeof setInterval> | null;
  roundCount: number;
  sessionMode: 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
}

interface TimerStore {
  workspaces: Record<number, WorkspaceTimerState>;
  activeWorkspaceId: number | null;
  defaultFocusDuration: number;
  defaultBreakDuration: number;
  defaultLongBreakDuration: number;
  longBreakInterval: number;

  setActiveWorkspace: (workspaceId: number, focusDuration?: number, breakDuration?: number) => void;
  getState: (workspaceId: number) => WorkspaceTimerState;
  startFocus: () => void;
  pauseFocus: (reason: string) => void;
  resumeFocus: () => void;
  startBreak: () => void;
  pauseBreak: () => void;
  resumeBreak: () => void;
  resetTimer: () => void;
  completeSession: () => void;
  tick: () => void;
  getActiveFocusDuration: () => number;
  getActiveBreakDuration: () => number;
  incrementDistraction: () => void;
}

const makeInitialState = (): WorkspaceTimerState => ({
  currentState: 'IDLE',
  timeRemaining: 45 * 60,
  pauseReason: null,
  sessionCount: 0,
  distractionCount: 0,
  intervalId: null,
  roundCount: 0,
  sessionMode: 'FOCUS',
});

export const useTimerStore = create<TimerStore>((set, get) => {
  const getWorkspaceState = (): WorkspaceTimerState => {
    const { activeWorkspaceId, workspaces } = get();
    if (activeWorkspaceId === null || !workspaces[activeWorkspaceId]) {
      return makeInitialState();
    }
    return workspaces[activeWorkspaceId];
  };

  const setWorkspaceState = (partial: Partial<WorkspaceTimerState>) => {
    const { activeWorkspaceId, workspaces } = get();
    if (activeWorkspaceId === null) return;
    const current = workspaces[activeWorkspaceId] || makeInitialState();
    set({
      workspaces: {
        ...workspaces,
        [activeWorkspaceId]: { ...current, ...partial },
      },
    });
  };

  return {
    workspaces: {},
    activeWorkspaceId: null,
    defaultFocusDuration: 45 * 60,
    defaultBreakDuration: 5 * 60,
    defaultLongBreakDuration: 15 * 60,
    longBreakInterval: 4,

    setActiveWorkspace: (workspaceId: number, focusDuration?: number, breakDuration?: number) => {
      const state = get();
      // Clear the PREVIOUSLY active workspace's interval — otherwise the orphaned
      // setInterval keeps calling get().tick(), which will decrement the NEW
      // workspace's timer (getWorkspaceState() points to the activeWorkspaceId).
      if (state.activeWorkspaceId !== null && state.workspaces[state.activeWorkspaceId]) {
        const prevInterval = state.workspaces[state.activeWorkspaceId].intervalId;
        if (prevInterval) {
          clearInterval(prevInterval);
        }
      }
      // Also clear any existing interval on the workspace being activated
      const existing = state.workspaces[workspaceId];
      if (existing && existing.intervalId) {
        clearInterval(existing.intervalId);
      }
      const fd = focusDuration !== undefined ? focusDuration * 60 : state.defaultFocusDuration;
      const bd = breakDuration !== undefined ? breakDuration * 60 : state.defaultBreakDuration;
      // Always force the activated workspace to IDLE with no running interval.
      // Reset the timeRemaining to ensure a clean start if navigating away mid-session and back.
      set({
        activeWorkspaceId: workspaceId,
        workspaces: {
          ...state.workspaces,
          [workspaceId]: {
            ...(existing || makeInitialState()),
            currentState: 'IDLE',
            timeRemaining: fd,
            intervalId: null,
            pauseReason: null,
            sessionMode: 'FOCUS',
          },
        },
        defaultFocusDuration: fd,
        defaultBreakDuration: bd,
      });
      if (!existing) {
        setWorkspaceState({ timeRemaining: fd });
      }
    },

    getState: (workspaceId: number): WorkspaceTimerState => {
      return get().workspaces[workspaceId] || makeInitialState();
    },

    tick: () => {
      const ws = getWorkspaceState();
      if (ws.timeRemaining <= 1) {
        get().completeSession();
      } else {
        setWorkspaceState({ timeRemaining: ws.timeRemaining - 1 });
      }
    },

    startFocus: () => {
      const existing = getWorkspaceState().intervalId;
      if (existing) clearInterval(existing);
      const id = setInterval(() => get().tick(), 1000);
      const fd = get().getActiveFocusDuration();
      setWorkspaceState({
        currentState: 'FOCUS_RUNNING',
        intervalId: id,
        timeRemaining: fd,
        sessionMode: 'FOCUS',
      });
    },

    pauseFocus: (reason: string) => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
      
      // Fire distraction alert/notification for any automatic pause (not Manual)
      if (reason !== 'Manual') {
        triggerDistractionAlert(reason);
      }

      setWorkspaceState({
        currentState: 'FOCUS_PAUSED',
        pauseReason: reason,
        intervalId: null,
      });
    },

    resumeFocus: () => {
      const id = setInterval(() => get().tick(), 1000);
      setWorkspaceState({
        currentState: 'FOCUS_RUNNING',
        intervalId: id,
        pauseReason: null,
      });
    },

    startBreak: () => {
      const existing = getWorkspaceState().intervalId;
      if (existing) clearInterval(existing);
      
      const ws = getWorkspaceState();
      // If we are already designated for a long break, use that.
      const bd = ws.sessionMode === 'LONG_BREAK' 
        ? get().defaultLongBreakDuration 
        : get().defaultBreakDuration;
      
      // If time was pre-loaded by completeSession (SESSION_COMPLETED), use it, otherwise use bd.
      const startingTime = ws.currentState === 'SESSION_COMPLETED' ? ws.timeRemaining : bd;

      let lastTick = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        const elapsed = now - lastTick;
        lastTick = now;
        const ticksToProcess = Math.max(1, Math.round(elapsed / 1000));
        for (let i = 0; i < ticksToProcess; i++) {
          get().tick();
        }
      }, 1000);
      setWorkspaceState({
        currentState: 'BREAK_RUNNING',
        intervalId: id,
        timeRemaining: startingTime,
        sessionMode: ws.sessionMode === 'FOCUS' ? 'SHORT_BREAK' : ws.sessionMode, // fallback if they manually start break
      });
    },

    pauseBreak: () => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
      setWorkspaceState({
        currentState: 'BREAK_PAUSED',
        intervalId: null,
      });
    },

    resumeBreak: () => {
      let lastTick = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        const elapsed = now - lastTick;
        lastTick = now;
        const ticksToProcess = Math.max(1, Math.round(elapsed / 1000));
        for (let i = 0; i < ticksToProcess; i++) {
          get().tick();
        }
      }, 1000);
      setWorkspaceState({
        currentState: 'BREAK_RUNNING',
        intervalId: id,
      });
    },

    resetTimer: () => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
      const fd = get().getActiveFocusDuration();
      setWorkspaceState({
        currentState: 'IDLE',
        timeRemaining: fd,
        intervalId: null,
        sessionMode: 'FOCUS',
      });
    },

    completeSession: () => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
      
      const ws = getWorkspaceState();
      let nextMode = ws.sessionMode;
      let nextTime = 0;
      let roundCount = ws.roundCount;
      let sessionCount = ws.sessionCount;

      if (ws.sessionMode === 'FOCUS') {
        sessionCount += 1;
        roundCount += 1;
        if (roundCount % get().longBreakInterval === 0) {
          nextMode = 'LONG_BREAK';
          nextTime = get().defaultLongBreakDuration;
        } else {
          nextMode = 'SHORT_BREAK';
          nextTime = get().defaultBreakDuration;
        }
      } else {
        // Was on break, back to focus
        nextMode = 'FOCUS';
        nextTime = get().defaultFocusDuration;
      }

      setWorkspaceState({
        currentState: 'SESSION_COMPLETED',
        sessionCount,
        roundCount,
        sessionMode: nextMode,
        timeRemaining: nextTime, // pre-load next phase duration
        intervalId: null,
      });
    },

    getActiveFocusDuration: () => {
      return get().defaultFocusDuration;
    },

    getActiveBreakDuration: () => {
      return get().defaultBreakDuration;
    },

    incrementDistraction: () => {
      const current = getWorkspaceState().distractionCount;
      setWorkspaceState({ distractionCount: current + 1 });
    },
  };
});

// Convenience function exports for components that use direct function imports
export function startFocus() { useTimerStore.getState().startFocus(); }
export function pauseFocus(reason: string) { useTimerStore.getState().pauseFocus(reason); }
export function resumeFocus() { useTimerStore.getState().resumeFocus(); }
export function startBreak() { useTimerStore.getState().startBreak(); }
export function pauseBreak() { useTimerStore.getState().pauseBreak(); }
export function resumeBreak() { useTimerStore.getState().resumeBreak(); }
export function resetTimer() { useTimerStore.getState().resetTimer(); }
export function incrementDistraction() { useTimerStore.getState().incrementDistraction(); }
export function getTimerState() {
  const store = useTimerStore.getState();
  const ws = store.workspaces[store.activeWorkspaceId ?? -1];
  return ws || { currentState: 'IDLE', timeRemaining: 25 * 60, focusDuration: 25 * 60, breakDuration: 5 * 60, sessionCount: 0, distractionCount: 0, pauseReason: null, roundCount: 0, sessionMode: 'FOCUS' };
}
export function initTimer(focusMinutes = 25, breakMinutes = 5) {
  // initTimer is called when workspace loads - set defaults
  useTimerStore.setState({ defaultFocusDuration: focusMinutes * 60, defaultBreakDuration: breakMinutes * 60, defaultLongBreakDuration: breakMinutes * 3 * 60 });
}
export function useTimer() {
  // Subscribe to timerStore for the active workspace
  const store = useTimerStore();
  const ws = store.workspaces[store.activeWorkspaceId ?? -1];
  const fd = store.defaultFocusDuration;
  const bd = store.defaultBreakDuration;
  return {
    currentState: ws?.currentState ?? 'IDLE',
    timeRemaining: ws?.timeRemaining ?? fd,
    focusDuration: fd,
    breakDuration: bd,
    sessionCount: ws?.sessionCount ?? 0,
    distractionCount: ws?.distractionCount ?? 0,
    pauseReason: ws?.pauseReason ?? null,
    roundCount: ws?.roundCount ?? 0,
    sessionMode: ws?.sessionMode ?? 'FOCUS',
    longBreakInterval: store.longBreakInterval,
    defaultLongBreakDuration: store.defaultLongBreakDuration,
  };
}