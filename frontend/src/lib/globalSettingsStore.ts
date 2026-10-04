import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GlobalSettingsState {
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  longBreakInterval: number;
  alarmSound: string;
  focusSound: string;
  setAutoStartBreaks: (val: boolean) => void;
  setAutoStartPomodoros: (val: boolean) => void;
  setLongBreakInterval: (val: number) => void;
  setAlarmSound: (val: string) => void;
  setFocusSound: (val: string) => void;
}

export const useGlobalSettings = create<GlobalSettingsState>()(
  persist(
    (set) => ({
      autoStartBreaks: false,
      autoStartPomodoros: false,
      longBreakInterval: 4,
      alarmSound: 'kitchen',
      focusSound: 'none',
      setAutoStartBreaks: (val) => set({ autoStartBreaks: val }),
      setAutoStartPomodoros: (val) => set({ autoStartPomodoros: val }),
      setLongBreakInterval: (val) => set({ longBreakInterval: val }),
      setAlarmSound: (val) => set({ alarmSound: val }),
      setFocusSound: (val) => set({ focusSound: val }),
    }),
    {
      name: 'prodify-global-settings',
    }
  )
);
