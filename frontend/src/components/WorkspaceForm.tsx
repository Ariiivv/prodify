import { useState } from 'react';
import { API_BASE } from '@/lib/config';

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

export default function WorkspaceForm({ isOpen, setIsOpen }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('Structured Goal Mode');
  const [targetHours, setTargetHours] = useState('');
  const [deadline, setDeadline] = useState('');
  const [workDuration, setWorkDuration] = useState('45');
  const [breakDuration, setBreakDuration] = useState('5');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string, type: 'success'|'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          name,
          mode,
          target_hours: targetHours ? parseFloat(targetHours) : null,
          deadline: deadline || null,
          work_duration: parseInt(workDuration) || 45,
          break_duration: parseInt(breakDuration) || 5,
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Workspace created!', 'success');
      setTimeout(() => setIsOpen(false), 1000);
    } catch {
      showToast('Failed to create workspace', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.msg}
        </div>
      )}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-6">Create Workspace</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Workspace Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors duration-200"
              placeholder="My Focus Session"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Mode</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 transition-colors duration-200"
            >
              <option>Structured Goal Mode</option>
              <option>Flexible Tracking Mode</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Work Duration (minutes)</label>
            <input
              type="number"
              value={workDuration}
              onChange={e => setWorkDuration(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors duration-200"
              placeholder="e.g. 45"
              min="1"
              max="180"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">Break Duration (minutes)</label>
            <input
              type="number"
              value={breakDuration}
              onChange={e => setBreakDuration(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors duration-200"
              placeholder="e.g. 5"
              min="1"
              max="60"
            />
          </div>
          {mode === 'Structured Goal Mode' && (
            <>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Target Hours</label>
                <input
                  type="number"
                  value={targetHours}
                  onChange={e => setTargetHours(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors duration-200"
                  placeholder="e.g. 21"
                  min="0"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 transition-colors duration-200"
                />
              </div>
            </>
          )}
          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02]"
            >
              Create Workspace
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
