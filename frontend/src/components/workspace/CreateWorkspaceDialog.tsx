import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface CreateWorkspaceDialogProps {
  onCreated?: () => void;
}

export default function CreateWorkspaceDialog({ onCreated }: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('structured');
  const [focusDuration, setFocusDuration] = useState('45');
  const [breakDuration, setBreakDuration] = useState('5');
  const [targetHours, setTargetHours] = useState('');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [focusKeywords, setFocusKeywords] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      mode,
      theme_color: 'violet', // Defaulting since color picker is removed
      work_duration: parseInt(focusDuration),
      break_duration: parseInt(breakDuration),
      target_hours: targetHours ? parseFloat(targetHours) : null,
      deadline: deadline ? deadline.toISOString().split('T')[0] : null,
      focus_keywords: focusKeywords.trim() || null,
    };

    try {
      const response = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error(err);
        throw new Error(err.detail || `HTTP ${response.status}`);
      }

      const workspace = await response.json();

      setOpen(false);
      // Reset form
      setName('');
      setMode('structured');
      setFocusDuration('45');
      setBreakDuration('5');
      setTargetHours('');
      setDeadline(undefined);
      setFocusKeywords('');
      setGoalDescription('');

      // Refresh workspace list and navigate to the new workspace
      onCreated?.();
      navigate(`/workspace/${workspace.id}`);
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        className="rounded-none bg-[#e8ff47] hover:bg-[#e8ff47]/80 text-black text-xs font-semibold px-4 py-2"
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        New Workspace
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111111] border border-[#2a2a2a] rounded-none p-6 w-full max-w-lg my-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Create Workspace</h2>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Mode Select (Pills) */}
                <div className="flex bg-transparent border border-[#2a2a2a] p-1 rounded-full">
                  <button
                    type="button"
                    onClick={() => setMode('structured')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      mode === 'structured' ? 'bg-[#2a2a2a] text-[#e8ff47]' : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    Structured Goal
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('flexible')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      mode === 'flexible' ? 'bg-[#2a2a2a] text-[#e8ff47]' : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    Flexible Tracking
                  </button>
                </div>

                {/* Workspace Name */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Workspace Name</label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Design Sprint"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                  />
                </div>

                {/* Focus and Break Durations */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Focus Duration (min)</label>
                    <Input
                      type="number"
                      required
                      value={focusDuration}
                      onChange={(e) => setFocusDuration(e.target.value)}
                      placeholder="45"
                      min="1"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Break Duration (min)</label>
                    <Input
                      type="number"
                      required
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(e.target.value)}
                      placeholder="5"
                      min="1"
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                    />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {mode === 'structured' && (
                    <motion.div
                      key="structured-fields"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      {/* Target Hours and Deadline */}
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Hours</label>
                          <Input
                            type="number"
                            value={targetHours}
                            onChange={(e) => setTargetHours(e.target.value)}
                            placeholder="20"
                            min="1"
                            className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Deadline</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={`w-full justify-start text-left font-normal bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none hover:bg-[#2a2a2a] hover:text-white ${!deadline && 'text-muted-foreground'}`}
                              >
                                <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
                                {deadline ? format(deadline, 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-[#111111] border-[#2a2a2a] rounded-none z-[9999] shadow-2xl relative">
                              <Calendar
                                mode="single"
                                selected={deadline}
                                onSelect={setDeadline}
                                initialFocus
                                className="text-white"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Goal Description */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Goal Description</label>
                        <textarea
                          value={goalDescription}
                          onChange={(e) => setGoalDescription(e.target.value)}
                          placeholder="What is the final deliverable for this workspace?"
                          rows={2}
                          className="flex w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-none px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e8ff47] resize-none"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Focus Keywords */}
                <div className="pt-2">
                  <label className="text-sm font-bold text-white block">Allowed Apps & Tasks</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Describe your session in plain English. The AI uses this to judge distractions.
                  </p>
                  <textarea
                    required
                    value={focusKeywords}
                    onChange={(e) => setFocusKeywords(e.target.value)}
                    placeholder="e.g., I am writing code in VS Code and reading React documentation on Chrome..."
                    rows={3}
                    className="flex w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-none px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e8ff47] resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={!name.trim()}
                    className="w-full bg-[#e8ff47] hover:bg-[#e8ff47]/90 text-black font-bold rounded-none h-11"
                  >
                    Create Workspace
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
