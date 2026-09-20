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
    <div className="w-full flex flex-col items-center gap-2 my-2">
      {todayGoal && (
        <p className="text-xs font-medium text-muted-foreground mb-1">
          Today's goal: <span className="text-white">{todayGoal.target_minutes_for_day} minutes</span> ({todayGoal.actual_minutes_logged} logged)
        </p>
      )}
      
      <div className="w-full max-w-[260px] bg-[#111111] border border-[#2a2a2a] p-3 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-3">
          <button onClick={prevMonth} className="text-muted-foreground hover:text-white transition-colors p-0.5">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[11px] font-bold text-white tracking-wide uppercase">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button onClick={nextMonth} className="text-muted-foreground hover:text-white transition-colors p-0.5">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-[9px] font-semibold text-muted-foreground/60 uppercase">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const goal = goalsMap.get(dateStr);
            const isSameMnth = isSameMonth(day, monthStart);
            const isTdy = isSameDay(day, new Date());
            
            let tooltip = "";
            let bgColor = "bg-transparent";
            let textColor = isSameMnth ? "text-prodify-muted" : "text-transparent";
            let border = isSameMnth ? "border border-transparent" : "";

            if (goal) {
               textColor = "text-white";
               const actual = goal.actual_minutes_logged;
               const target = goal.target_minutes_for_day;
               
               if (goal.status === 'future') {
                 bgColor = "bg-transparent";
                 border = "border border-prodify-border";
                 tooltip = `Target: ${target} min`;
               } else {
                 if (actual === 0) {
                   bgColor = "bg-prodify-danger/20";
                 } else if (actual < target / 2) {
                   bgColor = "bg-prodify-danger";
                 } else if (actual < target) {
                   bgColor = "bg-prodify-warning";
                   // Adding a slight text shadow to ensure the white text is readable against the bright yellow/lime backgrounds
                   textColor = "text-white drop-shadow-md";
                 } else if (actual <= target * 1.5) {
                   bgColor = "bg-prodify-success";
                   textColor = "text-white drop-shadow-md";
                 } else {
                   bgColor = "bg-prodify-accent";
                   textColor = "text-white drop-shadow-md";
                 }
                 tooltip = `${dateStr}\nTarget: ${target} min\nActual: ${actual} min`;
               }
            } else if (!isSameMnth) {
               bgColor = "bg-transparent opacity-0 pointer-events-none";
               border = "";
               textColor = "text-transparent";
            }
            
            const ring = isTdy ? "ring-1 ring-white ring-offset-1 ring-offset-[#111111]" : "";

            return (
              <div 
                key={day.toString()} 
                title={tooltip}
                className={`w-6 h-6 mx-auto flex items-center justify-center rounded-[3px] text-[10px] font-bold transition-colors cursor-default ${bgColor} ${textColor} ${border} ${ring}`}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
