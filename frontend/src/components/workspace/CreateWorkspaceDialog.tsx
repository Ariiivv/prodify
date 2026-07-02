import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '@/lib/config';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Layers, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

const THEME_COLORS = [
  { name: 'Violet', value: 'violet', bg: 'bg-violet-500', border: 'border-violet-400' },
  { name: 'Cyan', value: 'cyan', bg: 'bg-cyan-500', border: 'border-cyan-400' },
  { name: 'Emerald', value: 'emerald', bg: 'bg-emerald-500', border: 'border-emerald-400' },
  { name: 'Amber', value: 'amber', bg: 'bg-amber-500', border: 'border-amber-400' },
  { name: 'Rose', value: 'rose', bg: 'bg-rose-500', border: 'border-rose-400' },
];

interface CreateWorkspaceDialogProps {
  onCreated?: () => void;
}

export default function CreateWorkspaceDialog({ onCreated }: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('structured');
  const [themeColor, setThemeColor] = useState('violet');
  const [focusDuration, setFocusDuration] = useState('45');
  const [breakDuration, setBreakDuration] = useState('5');
  const [targetHours, setTargetHours] = useState('20');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [focusKeywords, setFocusKeywords] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const keywordsArray = focusKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const payload = {
      name: name.trim(),
      mode,
      theme_color: themeColor,
      work_duration: parseInt(focusDuration),
      break_duration: parseInt(breakDuration),
      target_hours: parseFloat(targetHours),
      deadline: deadline ? deadline.toISOString().split('T')[0] : null,
      user_id: 1,
      focus_keywords: keywordsArray.length > 0 ? JSON.stringify(keywordsArray) : null,
    };

    try {
      const response = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setThemeColor('violet');
      setFocusDuration('45');
      setBreakDuration('5');
      setTargetHours('20');
      setDeadline(undefined);
      setFocusKeywords('');

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
        className="rounded-xl bg-primary hover:bg-primary/80 text-white text-xs font-semibold px-4 py-2"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border/50 rounded-2xl p-6 w-full max-w-lg my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">New Workspace</h2>
                    <p className="text-xs text-muted-foreground">Configure your premium focus workspace</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Workspace Name */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Workspace Name</label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Design Sprint"
                    className="bg-secondary/50 border-border/50 rounded-xl"
                  />
                </div>

                {/* Mode Select */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mode</label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="w-full bg-secondary/50 border-border/50 rounded-xl">
                      <SelectValue placeholder="Select a mode" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl bg-card border-border/50">
                      <SelectItem value="structured">Structured Goal Mode</SelectItem>
                      <SelectItem value="flexible">Flexible Tracking Mode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Theme Color Picker */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Theme Color</label>
                  <div className="flex items-center gap-3">
                    {THEME_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setThemeColor(color.value)}
                        className={`w-8 h-8 rounded-full ${color.bg} transition-all relative flex items-center justify-center`}
                      >
                        {themeColor === color.value && (
                          <motion.div
                            layoutId="selectedColor"
                            className="absolute -inset-1 rounded-full border border-white/50"
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
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
                      className="bg-secondary/50 border-border/50 rounded-xl"
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
                      className="bg-secondary/50 border-border/50 rounded-xl"
                    />
                  </div>
                </div>

                {/* Target Hours and Deadline (visible if Structured) */}
                {mode === 'structured' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Hours</label>
                      <Input
                        type="number"
                        value={targetHours}
                        onChange={(e) => setTargetHours(e.target.value)}
                        placeholder="20"
                        min="1"
                        className="bg-secondary/50 border-border/50 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Deadline</label>
                      <Popover>
                        <PopoverTrigger className="w-full">
                          <span
                            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 w-full px-4 py-2 bg-secondary/50 border-border/50 rounded-xl ${!deadline ? 'text-muted-foreground' : ''}`}
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {deadline ? format(deadline, 'PPP') : <span>Pick a date</span>}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-slate-950 z-[9999] border border-slate-700 shadow-2xl relative">
                          <Calendar
                            mode="single"
                            selected={deadline}
                            onSelect={setDeadline}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                {/* Focus Keywords */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Focus Keywords (comma-separated)</label>
                  <textarea
                    value={focusKeywords}
                    onChange={(e) => setFocusKeywords(e.target.value)}
                    placeholder="e.g., VS Code, YouTube - Coder Coder, Notion, Terminal"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-secondary/50 border-border/50 rounded-xl resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Adaptive focus tracking will check if your active tab matches any of these keywords.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!name.trim()}
                    className="flex-1 rounded-xl"
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