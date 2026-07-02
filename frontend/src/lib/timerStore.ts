import { create } from 'zustand';

type FSMState = 'IDLE' | 'FOCUS_RUNNING' | 'FOCUS_PAUSED' | 'BREAK_RUNNING' | 'BREAK_PAUSED' | 'SESSION_COMPLETED';

interface WorkspaceTimerState {
  currentState: FSMState;
  timeRemaining: number;
  pauseReason: string | null;
  sessionCount: number;
  distractionCount: number;
  intervalId: ReturnType<typeof setInterval> | null;
}

interface TimerStore {
  workspaces: Record<number, WorkspaceTimerState>;
  activeWorkspaceId: number | null;
  defaultFocusDuration: number;
  defaultBreakDuration: number;

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

    setActiveWorkspace: (workspaceId: number, focusDuration?: number, breakDuration?: number) => {
      const state = get();
      const existing = state.workspaces[workspaceId];
      if (existing && existing.intervalId) {
        clearInterval(existing.intervalId);
      }
      const fd = focusDuration !== undefined ? focusDuration * 60 : state.defaultFocusDuration;
      const bd = breakDuration !== undefined ? breakDuration * 60 : state.defaultBreakDuration;
      set({
        activeWorkspaceId: workspaceId,
        workspaces: {
          ...state.workspaces,
          [workspaceId]: existing || makeInitialState(),
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
      });
    },

    pauseFocus: (reason: string) => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
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
      const bd = get().getActiveBreakDuration();
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
        timeRemaining: bd,
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
      });
    },

    completeSession: () => {
      const id = getWorkspaceState().intervalId;
      if (id) clearInterval(id);
      setWorkspaceState({
        currentState: 'SESSION_COMPLETED',
        sessionCount: getWorkspaceState().sessionCount + 1,
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
  return ws || { currentState: 'IDLE', timeRemaining: 45 * 60, focusDuration: 45 * 60, breakDuration: 5 * 60, sessionCount: 0, distractionCount: 0, pauseReason: null };
}
export function initTimer(focusMinutes = 45, breakMinutes = 5) {
  // initTimer is called when workspace loads - set defaults
  useTimerStore.setState({ defaultFocusDuration: focusMinutes * 60, defaultBreakDuration: breakMinutes * 60 });
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
  };
}