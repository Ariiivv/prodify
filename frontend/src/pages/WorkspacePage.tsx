import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Timer from '../components/Timer';
import BurnoutGauge from '../components/BurnoutGauge';
import EnforcementModal from '../components/EnforcementModal';
import ChatPanel from '../components/ChatPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';
import { useTabVisibility } from '../hooks/useTabVisibility';
import { useTimerStore } from '../store/timerStore';

interface Workspace {
  id: number;
  name: string;
  mode: string;
  work_duration: number;
  break_duration: number;
}

const WorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [burnoutProbability, setBurnoutProbability] = useState<number>(0);
  const { isVisible, distractionCount, enforcementTriggered, setEnforcementTriggered } = useTabVisibility();
  const setActiveWorkspace = useTimerStore(state => state.setActiveWorkspace);

  // Reactive subscription to workspace-scoped state
  const workspaces = useTimerStore(state => state.workspaces);
  const activeWsId = useTimerStore(state => state.activeWorkspaceId);
  const wsState = activeWsId !== null ? workspaces[activeWsId] : null;
  const currentState = wsState?.currentState ?? 'IDLE';
  const timeRemaining = wsState?.timeRemaining ?? 0;
  const sessionCount = wsState?.sessionCount ?? 0;

  const fetchWorkspace = async () => {
    try {
      const response = await fetch(`http://localhost:8000/workspaces/${id}`);
      const data: Workspace = await response.json();
      setWorkspace(data);
      // Initialize workspace-scoped timer with configurable durations
      setActiveWorkspace(data.id, data.work_duration, data.break_duration);
    } catch (error) {
      console.error(error);
      navigate('/'); // Redirect to home if workspace not found
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, [id]);

  const handleProbabilityChange = (probability: number) => {
    setBurnoutProbability(probability);
  };

  // Calculate focus minutes from the workspace-specific timeRemaining
  const focusDuration = workspace ? workspace.work_duration * 60 : 45 * 60;
  const focusMinutes = currentState === 'IDLE' ? 0 : Math.max(0, Math.floor((focusDuration - timeRemaining) / 60));

  let burnoutTip = '';
  if (burnoutProbability < 0.4) {
    burnoutTip = 'Great focus! Keep it up 💪';
  } else if (burnoutProbability < 0.7) {
    burnoutTip = 'Take a short break soon 😴';
  } else {
    burnoutTip = 'High burnout risk! Rest now ⚠️';
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <nav className="flex justify-between items-center mb-10">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white transition-colors duration-200 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Back to Home
        </button>
        <h2 className="text-2xl font-bold text-white">{workspace?.name || 'Loading Workspace...'}</h2>
        {workspace?.mode && (
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
              workspace.mode === 'Structured Goal Mode' ? 'bg-blue-600/20 text-blue-300' : 'bg-green-600/20 text-green-300'
            }`}
          >
            {workspace.mode}
          </span>
        )}
      </nav>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col gap-8">
              <Timer />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-white mb-4">Session Stats</h3>
                <div className="space-y-2 text-slate-300">
                  <p>Sessions Completed Today: <span className="font-semibold text-white">{sessionCount}</span></p>
                  <p>Total Focus Time: <span className="font-semibold text-white">{focusMinutes} minutes</span></p>
                  <p>Distraction Count: <span className="font-semibold text-white">{distractionCount}</span></p>
                  <p>Work Duration: <span className="font-semibold text-white">{workspace?.work_duration || 45} min</span></p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-8">
              <BurnoutGauge focusMinutes={focusMinutes} onProbabilityChange={handleProbabilityChange} />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-white mb-4">Productivity Tips</h3>
                <p className="text-slate-300">{burnoutTip}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {workspace && (
            <AnalyticsPanel workspaceId={workspace.id} workspaceName={workspace.name} />
          )}
        </div>
      </main>

      <EnforcementModal enforcementTriggered={enforcementTriggered} setEnforcementTriggered={setEnforcementTriggered} />
      {workspace && (
        <ChatPanel
          focusMinutes={focusMinutes}
          distractionCount={distractionCount}
          burnoutProbability={burnoutProbability}
          currentState={isVisible ? 'focused' : 'distracted'}
          sessionCount={sessionCount}
          workspaceName={workspace.name}
          workspaceMode={workspace.mode}
        />
      )}
    </div>
  );
};

export default WorkspacePage;