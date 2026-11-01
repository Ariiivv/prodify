import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar as CalendarIcon, Save, Pause, Play, CheckCircle2, Zap, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toLocalISODate } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface EditWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: any;
  onSaved: (updatedWs: any) => void;
}

const THEME_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const EditWorkspaceModal: React.FC<EditWorkspaceModalProps> = ({
  isOpen,
  onClose,
  workspace,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'sprint' | 'mastery' | 'casual' | 'quick_work'>('mastery');
  const [targetHours, setTargetHours] = useState('');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [dailyHours, setDailyHours] = useState('1');
  const [dailyMinutes, setDailyMinutes] = useState('0');
  const [focusDuration, setFocusDuration] = useState('25');
  const [breakDuration, setBreakDuration] = useState('5');
  const [currentGoal, setCurrentGoal] = useState('');
  const [themeColor, setThemeColor] = useState('#3b82f6');
  const [status, setStatus] = useState<'active' | 'paused' | 'completed'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (workspace && isOpen) {
      setName(workspace.name || '');
      setCategory(workspace.category || 'mastery');
      setTargetHours(workspace.target_hours ? String(workspace.target_hours) : '');
      if (workspace.deadline) {
        try {
          const localStr = toLocalISODate(workspace.deadline);
          setDeadline(localStr ? parseISO(localStr) : undefined);
        } catch {
          setDeadline(undefined);
        }
      } else {
        setDeadline(undefined);
      }
      const rawTotalDaily = workspace.daily_target_minutes ?? 60;
      // Sanitize: legacy Mastery workspace targets > 240m (e.g. 540m = 9h) reset to 60m
      const totalDaily = (workspace.category === 'mastery' && rawTotalDaily > 240) ? 60 : rawTotalDaily;
      setDailyHours(String(Math.floor(totalDaily / 60)));
      setDailyMinutes(String(totalDaily % 60));
      setFocusDuration(String(workspace.work_duration || 25));
      setBreakDuration(String(workspace.break_duration || 5));
      setCurrentGoal(workspace.current_goal || workspace.focus_keywords || '');
      setThemeColor(workspace.theme_color || '#3b82f6');
      setStatus((workspace.status || 'active').toLowerCase());
    }
  }, [workspace, isOpen]);

  if (!isOpen || !workspace) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Workspace name is required');
      return;
    }

    const workDur = parseInt(focusDuration, 10);
    const breakDur = parseInt(breakDuration, 10);
    if (isNaN(workDur) || workDur < 1) {
      toast.error('Focus duration must be at least 1 minute');
      return;
    }
    if (isNaN(breakDur) || breakDur < 1) {
      toast.error('Break duration must be at least 1 minute');
      return;
    }

    if (category === 'sprint' && (!deadline || !targetHours.trim())) {
      toast.error('Target hours and deadline date are required for Sprints');
      return;
    }

    const dailyMin = (parseInt(dailyHours, 10) || 0) * 60 + (parseInt(dailyMinutes, 10) || 0);
    if (category === 'mastery' && dailyMin < 15) {
      toast.error('Daily target must be at least 15 minutes for Mastery');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        mode: workspace.mode || 'structured',
        category,
        work_duration: workDur,
        break_duration: breakDur,
        long_break_duration: workspace.long_break_duration || 15,
        long_break_interval: workspace.long_break_interval || 4,
        target_hours: category === 'sprint' && targetHours.trim() ? parseFloat(targetHours) : null,
        deadline: category === 'sprint' && deadline ? format(deadline, 'yyyy-MM-dd') : null,
        daily_target_minutes: category === 'mastery' ? dailyMin : 0,
        focus_keywords: currentGoal.trim() || null,
        current_goal: currentGoal.trim() || null,
        theme_color: themeColor,
        camera_enabled: workspace.camera_enabled ?? false,
        status,
      };

      const res = await fetch(`${API_BASE}/workspaces/${workspace.id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to save workspace (HTTP ${res.status})`);
      }

      const updated = await res.json();
      toast.success('Workspace updated successfully');
      onSaved(updated);
      onClose();
    } catch (err: any) {
      console.error('Error updating workspace:', err);
      toast.error(err.message || 'Failed to update workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Edit Workspace</h2>
              <p className="text-xs text-zinc-400">Configure track quotas, deadlines, and timer settings.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-4 overflow-y-auto pr-1 flex-1">
            {/* Workspace Name */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1 block">Workspace Title</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Distributed Systems Exam"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>

            {/* Track Selector */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">Goal Track</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('sprint')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    category === 'sprint'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Target className={`w-4 h-4 mb-1 ${category === 'sprint' ? 'text-blue-400' : 'text-zinc-400'}`} />
                  <div className="text-xs font-bold">Sprint</div>
                  <div className="text-[10px] text-zinc-500">Deadline driven</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCategory('mastery')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    category === 'mastery'
                      ? 'border-purple-500 bg-purple-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className={`w-4 h-4 mb-1 ${category === 'mastery' ? 'text-purple-400' : 'text-zinc-400'}`} />
                  <div className="text-xs font-bold">Mastery</div>
                  <div className="text-[10px] text-zinc-500">Daily habit quota</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCategory('casual')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    category === 'casual' || category === 'quick_work'
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Zap className={`w-4 h-4 mb-1 ${category === 'casual' || category === 'quick_work' ? 'text-amber-400' : 'text-zinc-400'}`} />
                  <div className="text-xs font-bold">Quick Work</div>
                  <div className="text-[10px] text-zinc-500">Flexible, no quota</div>
                </button>
              </div>
            </div>

            {/* Sprint Settings: Target Hours + Deadline Date */}
            {category === 'sprint' && (
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 mb-1 block">Total Sprint Target (Hours)</label>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      value={targetHours}
                      onChange={(e) => setTargetHours(e.target.value)}
                      placeholder="e.g. 25"
                      className="bg-zinc-900 border-zinc-800 text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 mb-1 block">Sprint Deadline Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal bg-zinc-900 border-zinc-800 text-white text-sm hover:bg-zinc-800"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-blue-400" />
                          {deadline ? format(deadline, 'PPP') : <span className="text-zinc-500">Pick deadline date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="start">
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
              </div>
            )}

            {/* Mastery Settings: Daily Target Quota */}
            {category === 'mastery' && (
              <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-2">
                <label className="text-xs font-semibold text-zinc-300 block">Daily Target Quota</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 mb-1 block">Hours</label>
                    <Input
                      type="number"
                      min="0"
                      max="12"
                      value={dailyHours}
                      onChange={(e) => setDailyHours(e.target.value)}
                      className="bg-zinc-900 border-zinc-800 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 mb-1 block">Minutes</label>
                    <Input
                      type="number"
                      min="0"
                      max="55"
                      step="5"
                      value={dailyMinutes}
                      onChange={(e) => setDailyMinutes(e.target.value)}
                      className="bg-zinc-900 border-zinc-800 text-white text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  {[
                    { label: '1 Hour', h: '1', m: '0' },
                    { label: '2 Hours', h: '2', m: '0' },
                    { label: '3 Hours', h: '3', m: '0' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDailyHours(preset.h);
                        setDailyMinutes(preset.m);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Focus Timer Settings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1 block">Focus Duration (mins)</label>
                <Input
                  type="number"
                  min="5"
                  max="120"
                  value={focusDuration}
                  onChange={(e) => setFocusDuration(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-white text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1 block">Break Duration (mins)</label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-white text-sm"
                />
              </div>
            </div>

            {/* Declared Goal / Intent */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1 block">Session Focus Intent (Keywords/Goal)</label>
              <Input
                value={currentGoal}
                onChange={(e) => setCurrentGoal(e.target.value)}
                placeholder="e.g. Read chapters 4-6 and write notes on Docs"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>

            {/* Track Status Control */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">Track Status</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                    status === 'active'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" /> Active
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('paused')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                    status === 'paused'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Pause className="w-3.5 h-3.5" /> Paused
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('completed')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                    status === 'completed'
                      ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                </button>
              </div>
            </div>

            {/* Theme Color */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">Accent Color</label>
              <div className="flex items-center gap-2">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setThemeColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full transition-all ${
                      themeColor === color ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-white hover:bg-zinc-200 text-black font-bold flex items-center gap-2 rounded-xl transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
