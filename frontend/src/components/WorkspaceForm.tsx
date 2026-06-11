import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backdropVariants: any = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalVariants: any = {
    hidden: { opacity: 0, y: 40, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
    },
    exit: {
      opacity: 0,
      y: 20,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formItemVariants: any = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.05 * i, duration: 0.35, ease: 'easeOut' as const },
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buttonVariants: any = {
    rest: { scale: 1, boxShadow: '0 0 0px rgba(139, 92, 246, 0)' },
    hover: {
      scale: 1.03,
      boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)',
      transition: { type: 'spring' as const, stiffness: 400, damping: 15 },
    },
    tap: { scale: 0.97 },
  };

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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {toast && (
            <motion.div
              className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-white text-sm font-medium ${
                toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {toast.msg}
            </motion.div>
          )}
          <motion.div
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.h2
              className="text-xl font-bold text-white mb-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              Create Workspace
            </motion.h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <motion.div custom={0} variants={formItemVariants} initial="hidden" animate="visible">
            <label className="text-sm text-slate-400 mb-1 block">Workspace Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors duration-200"
              placeholder="My Focus Session"
            />
          </motion.div>
          <motion.div custom={1} variants={formItemVariants} initial="hidden" animate="visible">
            <label className="text-sm text-slate-400 mb-1 block">Mode</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 transition-colors duration-200"
            >
              <option>Structured Goal Mode</option>
              <option>Flexible Tracking Mode</option>
            </select>
          </motion.div>
          <motion.div custom={2} variants={formItemVariants} initial="hidden" animate="visible">
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
          </motion.div>
          <motion.div custom={3} variants={formItemVariants} initial="hidden" animate="visible">
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
          </motion.div>
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
          <motion.div
            className="flex gap-3 mt-2"
            custom={6}
            variants={formItemVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.button
              type="submit"
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 rounded-lg cursor-pointer"
              variants={buttonVariants}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              Create Workspace
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 rounded-lg cursor-pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              variants={{
                rest: { scale: 1, boxShadow: '0 0 0px rgba(100, 116, 139, 0)' },
                hover: {
                  scale: 1.03,
                  boxShadow: '0 0 16px rgba(100, 116, 139, 0.25)',
                  transition: { type: 'spring' as const, stiffness: 400, damping: 15 },
                },
                tap: { scale: 0.97 },
              } as any}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              Cancel
            </motion.button>
          </motion.div>
        </form>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
