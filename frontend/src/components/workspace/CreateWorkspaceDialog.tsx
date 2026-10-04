import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';

interface CreateWorkspaceDialogProps {
  onCreated: () => void;
  variant?: 'primary' | 'outline';
}

export default function CreateWorkspaceDialog({ onCreated, variant = 'primary' }: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('structured');
  const [category, setCategory] = useState('mastery');
  const [focusDuration, setFocusDuration] = useState('25');
  const [breakDuration, setBreakDuration] = useState('5');
  const [longBreakDuration, setLongBreakDuration] = useState('15');
  const [longBreakInterval, setLongBreakInterval] = useState('4');
  const [targetHours, setTargetHours] = useState('');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [dailyHours, setDailyHours] = useState('1');
  const [dailyMinutes, setDailyMinutes] = useState('0');
  const [focusKeywords, setFocusKeywords] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }

    const workDur = parseInt(focusDuration);
    const breakDur = parseInt(breakDuration);
    const longBreakDur = parseInt(longBreakDuration);
    const longBreakInt = parseInt(longBreakInterval);
    if (isNaN(workDur) || workDur < 1) {
      toast.error("Focus duration must be at least 1 minute");
      return;
    }
    if (isNaN(breakDur) || breakDur < 1) {
      toast.error("Break duration must be at least 1 minute");
      return;
    }
    if (isNaN(longBreakDur) || longBreakDur < 1) {
      toast.error("Long break duration must be at least 1 minute");
      return;
    }
    if (isNaN(longBreakInt) || longBreakInt < 1) {
      toast.error("Long break interval must be at least 1");
      return;
    }

    // Validation for sprint
    if (category === 'sprint') {
      if (!deadline || !targetHours.trim()) {
        toast.error("Target hours and deadline are required for Sprint mode");
        return;
      }
    }

    const dailyMin = (parseInt(dailyHours) || 0) * 60 + (parseInt(dailyMinutes) || 0);
    if (category === 'mastery' && dailyMin < 15) {
      toast.error("Daily target must be at least 15 minutes");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        mode,
        category,
        work_duration: workDur,
        break_duration: breakDur,
        long_break_duration: longBreakDur,
        long_break_interval: longBreakInt,
        target_hours: category === 'sprint' && targetHours.trim() ? parseFloat(targetHours) : null,
        deadline: category === 'sprint' && deadline ? format(deadline, 'yyyy-MM-dd') : null,
        daily_target_minutes: category === 'mastery' ? dailyMin : 60,
        focus_keywords: focusKeywords.trim() || null,
        current_goal: goalDescription.trim() || null,
        camera_enabled: cameraEnabled,
      };

      const response = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const err = await response.json();
          if (err.detail) {
            errMessage = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
          } else {
            errMessage = err.message || errMessage;
          }
        } catch (_) {}
        
        throw new Error(errMessage);
      }

      const workspace = await response.json();

      setOpen(false);
      setName('');
      setMode('structured');
      setCategory('mastery');
      setFocusDuration('25');
      setBreakDuration('5');
      setLongBreakDuration('15');
      setLongBreakInterval('4');
      setTargetHours('');
      setDeadline(undefined);
      setDailyHours('1');
      setDailyMinutes('0');
      setFocusKeywords('');
      setGoalDescription('');
      setCameraEnabled(false);

      onCreated?.();
      toast.success("Workspace created successfully!");
      navigate(`/workspace/${workspace.id}`);
    } catch (err: any) {
      toast.error(`Failed to create workspace: ${err.message}`);
      console.error("Workspace Creation Error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={
          variant === 'primary'
            ? "rounded-xl bg-blue-500 hover:bg-blue-500/80 text-black text-xs font-semibold px-4 py-2"
            : "border border-zinc-800 text-white bg-transparent hover:bg-zinc-900 px-4 py-2 text-xs rounded-xl"
        }
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
              className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 w-full max-w-lg my-8 shadow-2xl"
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
                {/* Category Select (Pills) */}
                <div className="flex bg-transparent border border-zinc-800 p-1 rounded-full">
                  <button
                    type="button"
                    onClick={() => setCategory('sprint')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      category === 'sprint' ? 'bg-zinc-800 text-blue-500' : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    🎯 Sprint (Deadline Driven)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory('mastery')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      category === 'mastery' ? 'bg-zinc-800 text-blue-500' : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    📚 Mastery (Continuous Track)
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
                    className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                  />
                </div>

                {/* Declared Goal / Intent Statement */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Declared Goal / Intent Statement</label>
                  <textarea
                    value={goalDescription}
                    onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="What are you focusing on in this workspace?"
                    rows={2}
                    className="flex w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 resize-none"
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
                      className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Short Break (min)</label>
                    <Input
                      type="number"
                      required
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(e.target.value)}
                      placeholder="5"
                      min="1"
                      className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Long Break Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Long Break (min)</label>
                    <Input
                      type="number"
                      required
                      value={longBreakDuration}
                      onChange={(e) => setLongBreakDuration(e.target.value)}
                      placeholder="15"
                      min="1"
                      className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Long Break Interval</label>
                    <Input
                      type="number"
                      required
                      value={longBreakInterval}
                      onChange={(e) => setLongBreakInterval(e.target.value)}
                      placeholder="4"
                      min="1"
                      className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Camera Tracking Toggle */}
                <div className="flex items-start gap-3">
                  <Switch
                    checked={cameraEnabled}
                    onCheckedChange={setCameraEnabled}
                    className="mt-0.5 data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-zinc-800 border-transparent"
                  />
                  <div className="flex flex-col">
                    <label className="text-sm font-bold text-white leading-none mb-1">
                      Enable Camera Tracking (Optional)
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Adds face-presence detection on top of tab/app tracking. Works best in good lighting. Off by default.
                    </p>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {category === 'sprint' && (
                    <motion.div
                      key="sprint-fields"
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
                            className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Deadline</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={`w-full justify-start text-left font-normal bg-zinc-900 border-zinc-800 text-white rounded-xl hover:bg-zinc-800 hover:text-white ${!deadline && 'text-muted-foreground'}`}
                              >
                                <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
                                {deadline ? format(deadline, 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800 rounded-xl z-[9999] shadow-2xl relative">
                              <Calendar
                                mode="single"
                                selected={deadline}
                                onSelect={setDeadline}
                                className="text-white"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {category === 'mastery' && (
                    <motion.div
                      key="mastery-fields"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      <div className="pt-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Daily Commitment</label>
                        <p className="text-[10px] text-muted-foreground mb-3">How much time do you want to dedicate to this track each day?</p>
                        
                        <div className="flex gap-2 mb-3">
                          {[30, 45, 60, 90, 120].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setDailyHours(Math.floor(preset / 60).toString());
                                setDailyMinutes((preset % 60).toString());
                              }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-sm border ${
                                ((parseInt(dailyHours) || 0) * 60 + (parseInt(dailyMinutes) || 0)) === preset 
                                  ? 'bg-blue-500/10 border-blue-500 text-blue-500' 
                                  : 'border-zinc-800 text-muted-foreground hover:bg-zinc-900 hover:text-white'
                              }`}
                            >
                              {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                            </button>
                          ))}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Hours</label>
                            <Input
                              type="number"
                              value={dailyHours}
                              onChange={(e) => setDailyHours(e.target.value)}
                              placeholder="1"
                              min="0"
                              className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Minutes</label>
                            <Input
                              type="number"
                              value={dailyMinutes}
                              onChange={(e) => setDailyMinutes(e.target.value)}
                              placeholder="0"
                              min="0"
                              max="59"
                              className="bg-zinc-900 border-zinc-800 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                            />
                          </div>
                        </div>
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
                    className="flex w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={!name.trim() || isSubmitting}
                    className="w-full bg-blue-500 hover:bg-blue-500/90 text-black font-bold rounded-xl h-11"
                  >
                    {isSubmitting ? "Creating..." : "Create Workspace"}
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
