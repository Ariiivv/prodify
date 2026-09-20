import React, { useEffect, useState, useMemo } from 'react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, parseISO, isAfter, isBefore, startOfDay
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DailyGoal {
  date: string;
  target_minutes_for_day: number;
  actual_minutes_logged: number;
  status: 'none' | 'under' | 'met' | 'exceeded' | 'future' | 'today';
}

interface StructuredGoalCalendarProps {
  workspaceId: number;
  mode: string;
  sessionCount: number;
}

export const StructuredGoalCalendar: React.FC<StructuredGoalCalendarProps> = ({ workspaceId, mode, sessionCount }) => {
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!mode || !mode.toLowerCase().includes('structured')) {
      setLoading(false);
      return;
    }

    const fetchGoals = async () => {
      try {
        const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/daily-goals`, { headers: getAuthHeaders() });
        if (response.ok) {
          const data = await response.json();
          setGoals(data);
        }
      } catch (error) {
        console.error('Failed to fetch daily goals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGoals();
  }, [workspaceId, mode, sessionCount]);

  const goalsMap = useMemo(() => {
    const map = new Map<string, DailyGoal>();
    goals.forEach(g => map.set(g.date, g));
    return map;
  }, [goals]);

  if (loading || !mode || !mode.toLowerCase().includes('structured') || goals.length === 0) {
    return null;
  }

  const todayGoal = goals.find((g) => g.status === 'today');
  
  // Calculate calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="w-full flex flex-col items-center gap-4 my-6">
      {todayGoal && (
        <p className="text-sm font-medium text-muted-foreground">
          Today's goal: <span className="text-white">{todayGoal.target_minutes_for_day} minutes</span> ({todayGoal.actual_minutes_logged} logged)
        </p>
      )}
      
      <div className="w-full max-w-sm bg-[#111111] border border-[#2a2a2a] p-4 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <button onClick={prevMonth} className="text-muted-foreground hover:text-white transition-colors p-1">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button onClick={nextMonth} className="text-muted-foreground hover:text-white transition-colors p-1">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground uppercase">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const goal = goalsMap.get(dateStr);
            const isSameMnth = isSameMonth(day, monthStart);
            const isTdy = isSameDay(day, new Date());
            
            let textColor = "text-muted-foreground/30"; // default greyish
            let tooltip = "";
            let bgColor = "bg-transparent";

            if (goal) {
               // In active range
               const actual = goal.actual_minutes_logged;
               const target = goal.target_minutes_for_day;
               
               if (goal.status === 'future') {
                 textColor = "text-white";
                 tooltip = `Target: ${target} min`;
               } else {
                 if (actual > target) {
                   textColor = "text-yellow-400"; // Gold
                 } else if (actual === target && actual > 0) {
                   textColor = "text-green-500"; // Green
                 } else if (actual >= target / 2) {
                   textColor = "text-yellow-500"; // Yellow
                 } else {
                   textColor = "text-red-500"; // Red
                 }
                 tooltip = `${dateStr}\nTarget: ${target} min\nActual: ${actual} min`;
               }
            } else if (isSameMnth) {
               textColor = "text-muted-foreground/50";
            }
            
            if (isTdy) {
               bgColor = "bg-[#2a2a2a] ring-1 ring-[#4a4a4a]";
            }

            return (
              <div 
                key={day.toString()} 
                title={tooltip}
                className={`text-xs py-2 rounded-md font-bold transition-colors cursor-default ${textColor} ${bgColor}`}
              >
                {format(day, dateFormat)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
