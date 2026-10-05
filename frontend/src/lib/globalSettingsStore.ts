import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GlobalSettingsState {
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  longBreakInterval: number;
  alarmSound: string;
  alarmSoundVolume: number;
  alarmSoundRepeat: number;
  focusSound: string;
  focusSoundVolume: number;
  hourFormat: '12-hour' | '24-hour';
  darkModeWhenRunning: boolean;
  reminderType: 'First' | 'Last' | 'None';
  reminderMinutes: number;
  setAutoStartBreaks: (val: boolean) => void;
  setAutoStartPomodoros: (val: boolean) => void;
  setLongBreakInterval: (val: number) => void;
  setAlarmSound: (val: string) => void;
  setAlarmSoundVolume: (val: number) => void;
  setAlarmSoundRepeat: (val: number) => void;
  setFocusSound: (val: string) => void;
  setFocusSoundVolume: (val: number) => void;
  setHourFormat: (val: '12-hour' | '24-hour') => void;
  setDarkModeWhenRunning: (val: boolean) => void;
  setReminderType: (val: 'First' | 'Last' | 'None') => void;
  setReminderMinutes: (val: number) => void;
}

export const useGlobalSettings = create<GlobalSettingsState>()(
  persist(
    (set) => ({
      autoStartBreaks: false,
      autoStartPomodoros: false,
      longBreakInterval: 4,
      alarmSound: 'kitchen',
      alarmSoundVolume: 50,
      alarmSoundRepeat: 1,
      focusSound: 'none',
      focusSoundVolume: 50,
      hourFormat: '12-hour',
      darkModeWhenRunning: false,
      reminderType: 'None',
      reminderMinutes: 5,
      setAutoStartBreaks: (val) => set({ autoStartBreaks: val }),
      setAutoStartPomodoros: (val) => set({ autoStartPomodoros: val }),
      setLongBreakInterval: (val) => set({ longBreakInterval: val }),
      setAlarmSound: (val) => set({ alarmSound: val }),
      setAlarmSoundVolume: (val) => set({ alarmSoundVolume: val }),
      setAlarmSoundRepeat: (val) => set({ alarmSoundRepeat: val }),
      setFocusSound: (val) => set({ focusSound: val }),
      setFocusSoundVolume: (val) => set({ focusSoundVolume: val }),
      setHourFormat: (val) => set({ hourFormat: val }),
      setDarkModeWhenRunning: (val) => set({ darkModeWhenRunning: val }),
      setReminderType: (val) => set({ reminderType: val }),
      setReminderMinutes: (val) => set({ reminderMinutes: val }),
    }),
    {
      name: 'prodify-global-settings',
    }
  )
);

