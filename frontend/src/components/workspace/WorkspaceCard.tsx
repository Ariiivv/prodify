import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, ArrowRight, MoreVertical, Pencil, Trash2, Flame } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

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

interface WorkspaceMetrics {
  pace: {
    score: number;
    label: string;
    consistency: number;
    volume: number;
    quality: number;
  };
  deep_work_ratio: number | null;
  calendar: { date: string; status: 'red' | 'yellow' | 'green' | 'golden' | null; actual_minutes?: number; target_minutes?: number }[];
  workspace_streak_current: number;
  workspace_streak_longest: number;
}

export interface WorkspaceMatrixItem {
  id: number;
  name: string;
  category: string;
  created_at: string;
  allowed_intent_whitelist: string;
  today_logged_minutes: number;
  daily_target_minutes: number;
  today_cleared: boolean;
  card_status_label: string;
  card_status_tone: 'success' | 'progress' | 'neutral' | 'danger';
  seven_day_chain: {
    date: string;
    day_name?: string;
    status: 'cleared' | 'partial' | 'missed' | 'untracked';
    minutes_logged: number;
    target_minutes: number;
  }[];
  top_distracting_os_apps: string[];
}

interface WorkspaceCardProps {
  workspace: Workspace;
  index?: number;
  onDeleted?: (workspaceId: number) => void;
  totalMinutesLogged?: number;
  matrixItem?: WorkspaceMatrixItem;
}

const WorkspaceCard = React.memo(function WorkspaceCard({ 
  workspace, 
  index = 0, 
  onDeleted, 
  totalMinutesLogged = 0,
  matrixItem
}: WorkspaceCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/metrics/workspace/${workspace.id}`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setMetrics(data);
        } else if (!res.ok) {
          console.error(`Failed to fetch workspace metrics: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Failed to fetch workspace metrics', err);
      } finally {
        if (isMounted) setIsLoadingMetrics(false);
      }
    };
    fetchMetrics();
    return () => { isMounted = false; };
  }, [workspace.id]);

  const today = new Date();
  const last7Days = Array.from({length: 7}).map((_, i) => format(subDays(today, 6 - i), 'yyyy-MM-dd'));

  const renderConsistencyChain = () => {
    if (matrixItem?.seven_day_chain) {
      return (
        <div className="flex items-center gap-1.5">
          {matrixItem.seven_day_chain.map((day) => {
            let className = "w-2.5 h-2.5 rounded-[3px] transition-all duration-300 ";
            if (day.status === 'untracked') {
              className += "border border-zinc-800 bg-transparent opacity-40";
            } else if (day.status === 'cleared') {
              className += "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
            } else if (day.status === 'partial') {
              className += "bg-amber-400/80";
            } else if (day.status === 'missed') {
              className += "bg-rose-500/80";
            }

            const statusDisplay = day.status === 'cleared' ? 'Cleared' :
              day.status === 'partial' ? 'In Progress' :
              day.status === 'missed' ? 'Missed Quota' : 'Untracked';
            
            const tooltipText = `${day.day_name || day.date}: ${statusDisplay} (${day.minutes_logged}m / ${day.target_minutes}m)`;

            return (
              <TooltipProvider key={day.date} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={className} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs bg-zinc-950 border-zinc-800 text-white">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      );
    }

    if (isLoadingMetrics || !metrics) {
      return (
        <div className="flex items-center gap-1">
          {Array.from({length: 7}).map((_, i) => (
             <div key={i} className="w-2.5 h-2.5 rounded-full border border-[#333333] bg-transparent animate-pulse" />
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        {last7Days.map(dateStr => {
          const dayLog = metrics.calendar?.find((c) => c.date === dateStr);
          let className = "w-2.5 h-2.5 rounded-[3px] transition-all duration-300 ";
          
          if (!dayLog || !dayLog.status) {
            className += "border border-zinc-800 bg-transparent opacity-40";
          } else if (dayLog.status === 'golden' || dayLog.status === 'green') {
            className += "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
          } else if (dayLog.status === 'yellow') {
            className += "bg-amber-400/80";
          } else if (dayLog.status === 'red') {
            className += "bg-rose-500/80";
          }

          const statusDisplay = dayLog?.status ? dayLog.status.charAt(0).toUpperCase() + dayLog.status.slice(1) : 'No activity';
          const tooltipText = `${format(parseISO(dateStr), 'MMM d')}: ${statusDisplay}`;
          
          return (
            <TooltipProvider key={dateStr} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={className} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-zinc-950 border-zinc-800 text-white">
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
  const currentStreak = metrics ? metrics.workspace_streak_current : (workspace.current_streak || 0);

  const todayLogged = matrixItem ? matrixItem.today_logged_minutes : 0;
  const dailyTarget = matrixItem ? matrixItem.daily_target_minutes : (workspace.daily_target_minutes || (isSprint ? 60 : 60));
  const todayCleared = matrixItem ? matrixItem.today_cleared : false;
  const statusLabel = matrixItem?.card_status_label || (todayLogged > 0 ? `${todayLogged}m left today` : 'Ready to Start');
  const statusTone = matrixItem?.card_status_tone || 'neutral';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ y: -4, transition: { duration: 0.18 } }}
        onClick={() => navigate(`/workspace/${workspace.id}`)}
        className="relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 cursor-pointer overflow-hidden group h-full"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${isSprint ? 'from-blue-500/5' : 'from-[#8b5cf6]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
        
        <div className="relative z-10 flex flex-col h-full flex-grow">
          <div className="flex items-center justify-between mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSprint ? 'bg-blue-500/10' : 'bg-[#8b5cf6]/10'}`}>
              <Layers className={`w-5 h-5 ${isSprint ? 'text-white' : 'text-[#8b5cf6]'}`} />
            </div>
            <div className="flex items-center gap-1">
              <ArrowRight className="w-4 h-4 text-[#888888] opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={handleDeleteClick}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-[#888888] hover:text-red-400 hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <button
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-[#888888] hover:text-white hover:bg-white/5 transition-all"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border-zinc-800 bg-zinc-950 shadow-xl text-white">
                  <DropdownMenuItem onClick={handleEdit} className="cursor-pointer rounded-xl hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer rounded-xl text-red-400 hover:text-red-300 focus:text-red-300 hover:bg-zinc-800 focus:bg-zinc-800">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-white">{workspace.name}</h3>
            {currentStreak > 0 && (
              <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-sm border border-orange-400/20 shadow-[0_0_8px_rgba(251,146,60,0.2)] flex items-center">
                <Flame className="w-3 h-3 mr-0.5 inline" /> {currentStreak}d
              </span>
            )}
          </div>

          <p className="text-xs text-[#888888] line-clamp-2 mb-5 flex-grow">
            {workspace.focus_keywords || workspace.description || `${workspace.mode || 'structured'} track`}
          </p>
          
          <div className="mt-auto pt-2">
              {renderConsistencyChain()}
              <div className="mt-2" />
              
              <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#888888] uppercase tracking-wider text-[10px] font-bold">Total Logged</span>
                <span className="text-white font-mono font-bold">{totalHoursLogged}h</span>
              </div>
              
              {/* Today's Quota Progress */}
              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Today's Quota</span>
                  <span className={`text-[11px] font-mono font-bold ${
                    statusTone === 'success' || statusTone === 'green' ? 'text-emerald-400' :
                    statusTone === 'progress' || statusTone === 'amber' || statusTone === 'blue' ? 'text-blue-400' :
                    statusTone === 'danger' || statusTone === 'red' ? 'text-rose-400' : 'text-zinc-400'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                {dailyTarget > 0 ? (
                  <>
                    <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          todayCleared ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' :
                          todayLogged > 0 ? 'bg-blue-500' : 'bg-transparent'
                        }`}
                        style={{ width: `${Math.min(100, Math.round((todayLogged / dailyTarget) * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                      <span>{todayLogged}m / {dailyTarget}m Today</span>
                      <span>{Math.round((todayLogged / dailyTarget) * 100)}%</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-zinc-500 font-mono">
                    <span>{todayLogged > 0 ? `${todayLogged}m logged today` : 'Flexible flow'}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-zinc-800">
                <span className={`${isSprint ? 'text-blue-500 bg-blue-500/10 border-blue-500/20' : 'text-[#8b5cf6] bg-[#8b5cf6]/10 border-[#8b5cf6]/20'} px-2 py-1 rounded-xl text-[10px] font-bold tracking-wide uppercase border`}>
                  {isSprint ? '⚡ Sprint' : '🌌 Mastery'}
                </span>
                
                <button className={`text-[10px] font-bold text-white uppercase tracking-wider ${isSprint ? 'hover:text-blue-500' : 'hover:text-[#8b5cf6]'} transition-colors flex items-center gap-1`}>
                  Continue Track <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

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
              className="relative w-full max-w-sm z-50 p-6 flex flex-col gap-4 rounded-xl shadow-2xl"
              style={{ backgroundColor: '#09090b', border: '1px solid #27272a' }}
            >
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Delete Workspace?</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Your focus data helps the AI coach guide you better. Keep it?</p>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => confirmDelete(true)}
                  className="w-full py-2.5 text-sm font-semibold text-black transition-colors rounded-xl"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  Keep Data
                </button>
                <button
                  onClick={() => confirmDelete(false)}
                  className="w-full py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors rounded-xl"
                  style={{ border: '1px solid #27272a', backgroundColor: '#09090b' }}
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
});

export default WorkspaceCard;
