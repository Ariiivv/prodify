import { useTimerStore } from '@/store/timerStore';
import { useTabVisibility } from '@/hooks/useTabVisibility';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const PAUSE_REASONS = ['Restroom', 'Urgent Call', 'Interruption'];

export default function Timer() {
  const {
    startFocus, pauseFocus, resumeFocus,
    startBreak, pauseBreak, resumeBreak, resetTimer
  } = useTimerStore();

  // Reactive subscription to the active workspace state
  const workspaces = useTimerStore(state => state.workspaces);
  const activeWsId = useTimerStore(state => state.activeWorkspaceId);
  const wsState = activeWsId !== null ? workspaces[activeWsId] : null;
  const currentState = wsState?.currentState ?? 'IDLE';
  const timeRemaining = wsState?.timeRemaining ?? 0;
  const sessionCount = wsState?.sessionCount ?? 0;

  const { distractionCount } = useTabVisibility();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center w-full">
      <span className="text-xs uppercase tracking-widest text-slate-400 mb-2 select-none">{currentState}</span>
      <div className="text-7xl font-mono font-bold mb-6 text-white select-none">{formatTime(timeRemaining)}</div>

      {currentState === 'IDLE' && (
        <button onClick={startFocus} className="px-8 py-3 bg-green-500 hover:bg-green-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
          Start Focus Session
        </button>
      )}
      {currentState === "FOCUS_RUNNING" && (
        <button onClick={() => pauseFocus("Restroom")} className="px-8 py-3 bg-yellow-500 hover:bg-yellow-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
          Pause
        </button>
      )}
      {currentState === "FOCUS_PAUSED" && (
        <div className="flex flex-col items-center gap-3">
          <select
            onChange={(e) => useTimerStore.getState().pauseFocus(e.target.value)}
            className="px-4 py-2 bg-slate-800 rounded-lg text-white border border-slate-600 focus:outline-none focus:border-violet-500 transition-colors duration-200">
            {PAUSE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={resumeFocus} className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
            Resume
          </button>
        </div>
      )}
      {currentState === "BREAK_RUNNING" && (
        <button onClick={pauseBreak} className="px-8 py-3 bg-purple-500 hover:bg-purple-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
          Pause Break
        </button>
      )}
      {currentState === "BREAK_PAUSED" && (
        <button onClick={resumeBreak} className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
          Resume Break
        </button>
      )}
      {currentState === "SESSION_COMPLETED" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xl text-green-400 font-semibold">Session Complete! 🎉</p>
          <button onClick={startBreak} className="px-8 py-3 bg-green-500 hover:bg-green-600 rounded-lg text-lg font-semibold text-white transition-all duration-200 ease-in-out transform hover:scale-105">
            Start Break
          </button>
        </div>
      )}

      <div className="mt-6 text-slate-500 text-sm">
        Sessions: {sessionCount} | Distractions: {distractionCount}
      </div>
      <button onClick={resetTimer} className="mt-2 text-xs text-slate-600 hover:text-slate-400 transition-colors duration-200">
        Reset
      </button>
    </div>
  );
}