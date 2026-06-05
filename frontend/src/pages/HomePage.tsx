import React, { useState, useEffect } from 'react';
import WorkspaceForm from '../components/WorkspaceForm';
import { useNavigate } from 'react-router-dom';

interface Workspace {
  id: number;
  name: string;
  mode: string;
}

const HomePage: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const navigate = useNavigate();

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch("http://localhost:8000/workspaces");
      const data: Workspace[] = await response.json();
      setWorkspaces(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTotalSessions = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/telemetry/total-sessions");
      const data = await response.json();
      setTotalSessions(data.total_sessions);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchTotalSessions();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      fetchWorkspaces();
    }
  }, [isOpen]);

  const handleEnterWorkspace = (id: number) => {
    navigate(`/workspace/${id}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <header className="flex justify-between items-center mb-12">
        <div className="flex-grow text-center">
          <h1 className="text-5xl font-extrabold tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            Prodify
          </h1>
          <p className="text-slate-400 font-medium">AI-Powered Focus & Burnout Prevention</p>
        </div>
        <button
          className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-105"
          onClick={() => setIsOpen(true)}
        >
          ＋ Create New Workspace
        </button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
          <h3 className="text-slate-300 text-lg font-semibold mb-2">Total Workspaces</h3>
          <p className="text-4xl font-bold text-violet-400">{workspaces.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
          <h3 className="text-slate-300 text-lg font-semibold mb-2">Total Sessions</h3>
          <p className="text-4xl font-bold text-emerald-400">{totalSessions}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-6">Your Workspaces</h2>
        {workspaces.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xl">
            No workspaces yet. Create your first one!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between transform transition-all duration-200 ease-in-out hover:scale-[1.02] hover:shadow-lg"
              >
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{workspace.name}</h3>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      workspace.mode === 'Structured Goal Mode' ? 'bg-blue-600/20 text-blue-300' : 'bg-green-600/20 text-green-300'
                    }`}
                  >
                    {workspace.mode}
                  </span>
                </div>
                <button
                  className="mt-4 self-end bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 px-5 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-105"
                  onClick={() => handleEnterWorkspace(workspace.id)}
                >
                  Enter Workspace →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <WorkspaceForm isOpen={isOpen} setIsOpen={setIsOpen} />
    </div>
  );
};

export default HomePage;