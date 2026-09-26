import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, Timer, ArrowRight, Flame, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface GoalPlan {
  target_hours: number;
  deadline: string;
  deadline_display: string;
  days_remaining: number;
  historical_sprint_minutes: number;
  daily_minutes_required: number;
  sessions_per_day: number;
  morning_sessions: number;
  afternoon_sessions: number;
}

interface Workspace {
  id: number;
  name: string;
  mode?: string;
  category?: string;
  work_duration?: number;
  target_hours?: number;
  daily_target_minutes?: number;
  current_streak?: number;
  deadline?: string;
  focus_keywords?: string;
  description?: string;
}


interface RecentLog {
  date: string;
  target_met: boolean;
  minutes_logged: number;
  target_minutes_required: number;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  index?: number;
  onDeleted?: (workspaceId: number) => void;
  goalPlan?: GoalPlan;
  totalMinutesLogged?: number;
}

export default function WorkspaceCard({ workspace, index = 0, onDeleted, goalPlan, totalMinutesLogged = 0 }: WorkspaceCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/analytics/workspace/${workspace.id}/recent`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setRecentLogs(data);
        }
      } catch (err) {
        console.error('Failed to fetch recent logs', err);
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    };
    fetchLogs();
    return () => { isMounted = false; };
  }, [workspace.id]);

  const today = new Date();
  const last7Days = Array.from({length: 7}).map((_, i) => format(subDays(today, 6 - i), 'yyyy-MM-dd'));

  const renderConsistencyChain = () => {
    if (isLoadingLogs) {
      return (
        <div className="flex items-center gap-1.5 mt-3 mb-1">
          {Array.from({length: 7}).map((_, i) => (
             <div key={i} className="w-2.5 h-2.5 rounded-full border border-[#333333] bg-transparent animate-pulse" />
          ))}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 mt-3 mb-1">
        {last7Days.map(dateStr => {
          const log = recentLogs.find(l => l.date === dateStr);
          let state = 'missed';
          if (log?.target_met) state = 'met';
          else if (log && log.minutes_logged > 0) state = 'partial';
          
          let className = "w-2.5 h-2.5 rounded-full transition-all duration-300 ";
          if (state === 'met') className += "bg-[#e8ff47] shadow-[0_0_8px_#e8ff47]";
          else if (state === 'partial') className += "bg-amber-400/80";
          else className += "border border-[#333333] bg-transparent";

          const tooltipText = log 
            ? `${format(new Date(dateStr), 'MMM d')}: ${log.minutes_logged}m / ${log.target_minutes_required}m` 
            : `${format(new Date(dateStr), 'MMM d')}: No activity`;
          
          return (
            <TooltipProvider key={dateStr} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={className} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-[#111111] border-[#2a2a2a] text-white">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };


  const confirmDelete = async (keepMetrics: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspace.id}?keep_metrics=${keepMetrics}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const err = await response.json();
        console.error(err);
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      onDeleted?.(workspace.id);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const isSprint = workspace.category === 'sprint';
  const totalHoursLogged = (totalMinutesLogged / 60).toFixed(1);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ y: -4, transition: { duration: 0.18 } }}
        onClick={() => navigate(`/workspace/${workspace.id}`)}
        className="relative flex flex-col rounded-none border border-[#2a2a2a] bg-[#161616] p-5 cursor-pointer overflow-hidden group h-full"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${isSprint ? 'from-[#e8ff47]/5' : 'from-[#8b5cf6]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
        
        <div className="relative z-10 flex flex-col h-full flex-grow">
          <div className="flex items-center justify-between mb-4">
            <div className={`w-10 h-10 rounded-none flex items-center justify-center ${isSprint ? 'bg-[#e8ff47]/10' : 'bg-[#8b5cf6]/10'}`}>
              <Layers className={`w-5 h-5 ${isSprint ? 'text-[#e8ff47]' : 'text-[#8b5cf6]'}`} />
            </div>
            <div className="flex items-center gap-1">
              <ArrowRight className="w-4 h-4 text-[#888888] opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={handleDeleteClick}
                className="w-7 h-7 rounded-none flex items-center justify-center text-[#888888] hover:text-red-400 hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <button
                    className="w-7 h-7 rounded-none flex items-center justify-center text-[#888888] hover:text-white hover:bg-white/5 transition-all"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-none border-[#2a2a2a] bg-[#111111] shadow-xl text-white">
                  <DropdownMenuItem onClick={handleEdit} className="cursor-pointer rounded-none hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:text-white">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer rounded-none text-red-400 hover:text-red-300 focus:text-red-300 hover:bg-[#2a2a2a] focus:bg-[#2a2a2a]">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-white">{workspace.name}</h3>
            {(workspace.current_streak || 0) > 0 && (
              <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-sm border border-orange-400/20 shadow-[0_0_8px_rgba(251,146,60,0.2)]">
                🔥 {workspace.current_streak}d
              </span>
            )}
          </div>

          
          <p className="text-xs text-[#888888] line-clamp-2 mb-5">
            {workspace.focus_keywords || workspace.description || `${workspace.mode || 'structured'} track`}
          </p>
          
          <div className="mt-auto pt-2">
            {renderConsistencyChain()}
            <div className="mt-2" />
            {isSprint ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white font-mono font-bold">{totalHoursLogged}h / {workspace.target_hours || '?'}h</span>
                  {goalPlan?.days_remaining !== undefined && (
                    <span className="text-[#111111] bg-[#e8ff47] px-2 py-0.5 rounded-none font-bold font-mono">
                      {goalPlan.days_remaining}d left
                    </span>
                  )}
                </div>
                
                {goalPlan ? (
                  <div className="bg-[#111111] border border-[#2a2a2a] p-2 flex justify-between items-center">
                    <span className="text-[10px] text-[#888888] uppercase tracking-wider font-bold">Pacing</span>
                    {goalPlan.daily_minutes_required > 480 ? (
                      <span className="text-xs text-red-400 font-bold flex items-center gap-1">⚠️ At Risk</span>
                    ) : (
                      <span className="text-xs text-white font-mono font-bold">{(goalPlan.daily_minutes_required / 60).toFixed(1)}h / day</span>
                    )}
                  </div>
                ) : workspace.target_hours && workspace.deadline ? (
                  (() => {
                    const remaining = Math.max(0, (workspace.target_hours || 0) - parseFloat(totalHoursLogged));
                    const daysLeft = Math.max(1, Math.ceil((new Date(workspace.deadline).getTime() - Date.now()) / 86400000));
                    const dailyHours = remaining / daysLeft;
                    return (
                      <div className="bg-[#111111] border border-[#2a2a2a] p-2 flex justify-between items-center">
                        <span className="text-[10px] text-[#888888] uppercase tracking-wider font-bold">Pacing</span>
                        {dailyHours > 8 ? (
                          <span className="text-xs text-red-400 font-bold flex items-center gap-1">⚠️ At Risk</span>
                        ) : (
                          <span className="text-xs text-white font-mono font-bold">{dailyHours.toFixed(1)}h / day</span>
                        )}
                      </div>
                    );
                  })()
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#888888] uppercase tracking-wider text-[10px] font-bold">Daily Goal</span>
                  <span className="text-white font-mono font-bold">{workspace.daily_target_minutes || 60}m</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#888888] uppercase tracking-wider text-[10px] font-bold">Total Logged</span>
                  <span className="text-white font-mono font-bold">{totalHoursLogged}h</span>
                </div>
                
                <div className="flex items-center justify-between mt-2 pt-3 border-t border-[#2a2a2a]">
                  <span className="text-[#8b5cf6] bg-[#8b5cf6]/10 px-2 py-1 rounded-none text-[10px] font-bold tracking-wide uppercase border border-[#8b5cf6]/20">
                    📚 Continuous
                  </span>
                  
                  <button className="text-[10px] font-bold text-white uppercase tracking-wider hover:text-[#8b5cf6] transition-colors flex items-center gap-1">
                    Continue Track <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Smart Deletion Dialog */}
      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); setIsDeleting(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm z-50 p-6 flex flex-col gap-4 rounded-none shadow-2xl"
              style={{ backgroundColor: '#111111', border: '1px solid #2a2a2a' }}
            >
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Delete Workspace?</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Your focus data helps the AI coach guide you better. Keep it?</p>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => confirmDelete(true)}
                  className="w-full py-2.5 text-sm font-semibold text-black transition-colors rounded-none"
                  style={{ backgroundColor: '#e8ff47' }}
                >
                  Keep Data
                </button>
                <button
                  onClick={() => confirmDelete(false)}
                  className="w-full py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors rounded-none"
                  style={{ border: '1px solid #2a2a2a', backgroundColor: '#111111' }}
                >
                  Delete Everything
                </button>
                <button
                  onClick={() => setIsDeleting(false)}
                  className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
