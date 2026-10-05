import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Volume2, Clock, Palette } from 'lucide-react';
import { useGlobalSettings } from '@/lib/globalSettingsStore';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TimerSettingsModal({ isOpen, onClose }: Props) {
  const settings = useGlobalSettings();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md z-50 flex flex-col rounded-2xl shadow-2xl bg-zinc-950 border border-zinc-800 overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              Global Settings
            </h2>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
            
            {/* Timer Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Timer
              </h3>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Auto Start Breaks</span>
                <Switch 
                  checked={settings.autoStartBreaks} 
                  onCheckedChange={settings.setAutoStartBreaks} 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Auto Start Pomodoros</span>
                <Switch 
                  checked={settings.autoStartPomodoros} 
                  onCheckedChange={settings.setAutoStartPomodoros} 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Long Break Interval</span>
                <Input 
                  type="number"
                  min={1}
                  max={10}
                  value={settings.longBreakInterval}
                  onChange={(e) => settings.setLongBreakInterval(parseInt(e.target.value) || 4)}
                  className="w-20 bg-zinc-900 border-zinc-800 text-center text-white"
                />
              </div>
            </div>

            {/* Sound Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5" /> Sound
              </h3>
              
              <div className="space-y-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Alarm Sound</span>
                  <select 
                    value={settings.alarmSound}
                    onChange={(e) => settings.setAlarmSound(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-white rounded-md px-3 py-1.5 text-sm outline-none"
                  >
                    <option value="kitchen">Kitchen</option>
                    <option value="digital">Digital</option>
                    <option value="bell">Bell</option>
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-16">Volume</span>
                  <input type="range" min="0" max="100" value={settings.alarmSoundVolume} onChange={(e) => settings.setAlarmSoundVolume(parseInt(e.target.value))} className="flex-1 accent-white" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{settings.alarmSoundVolume}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Repeat Count</span>
                  <Input 
                    type="number"
                    min={1}
                    max={10}
                    value={settings.alarmSoundRepeat}
                    onChange={(e) => settings.setAlarmSoundRepeat(parseInt(e.target.value) || 1)}
                    className="w-16 h-7 bg-zinc-900 border-zinc-800 text-center text-white text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Focus Sound</span>
                  <select 
                    value={settings.focusSound}
                    onChange={(e) => settings.setFocusSound(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-white rounded-md px-3 py-1.5 text-sm outline-none"
                  >
                    <option value="none">None</option>
                    <option value="rain">Rain</option>
                    <option value="coffee_shop">Coffee Shop</option>
                    <option value="white_noise">White Noise</option>
                  </select>
                </div>
                {settings.focusSound !== 'none' && (
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-16">Volume</span>
                    <input type="range" min="0" max="100" value={settings.focusSoundVolume} onChange={(e) => settings.setFocusSoundVolume(parseInt(e.target.value))} className="flex-1 accent-white" />
                    <span className="text-xs text-muted-foreground w-8 text-right">{settings.focusSoundVolume}%</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Display Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" /> Display & Misc
              </h3>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Hour Format</span>
                <select 
                  value={settings.hourFormat}
                  onChange={(e) => settings.setHourFormat(e.target.value as '12-hour' | '24-hour')}
                  className="bg-zinc-900 border border-zinc-800 text-white rounded-md px-3 py-1.5 text-sm outline-none"
                >
                  <option value="12-hour">12-hour</option>
                  <option value="24-hour">24-hour</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Dark Mode when running</span>
                <Switch 
                  checked={settings.darkModeWhenRunning} 
                  onCheckedChange={settings.setDarkModeWhenRunning} 
                />
              </div>
            </div>

            {/* Reminder Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Reminder
              </h3>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Type</span>
                <select 
                  value={settings.reminderType}
                  onChange={(e) => settings.setReminderType(e.target.value as 'First' | 'Last' | 'None')}
                  className="bg-zinc-900 border border-zinc-800 text-white rounded-md px-3 py-1.5 text-sm outline-none"
                >
                  <option value="None">None</option>
                  <option value="First">First</option>
                  <option value="Last">Last</option>
                </select>
              </div>
              {settings.reminderType !== 'None' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Minutes</span>
                  <Input 
                    type="number"
                    min={1}
                    max={60}
                    value={settings.reminderMinutes}
                    onChange={(e) => settings.setReminderMinutes(parseInt(e.target.value) || 5)}
                    className="w-20 bg-zinc-900 border-zinc-800 text-center text-white"
                  />
                </div>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
