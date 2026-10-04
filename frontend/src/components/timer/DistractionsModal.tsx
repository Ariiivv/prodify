import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, MonitorSmartphone, Calendar, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

interface Distraction {
  id: number;
  app_name: string;
  window_title: string;
  timestamp: string;
  reason?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
  currentSessionDistractions: number;
}

export function DistractionsModal({ isOpen, onClose, workspaceId, currentSessionDistractions }: Props) {
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDistractions();
    }
  }, [isOpen, workspaceId]);

  const fetchDistractions = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/distractions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDistractions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
          className="relative w-full max-w-lg z-50 flex flex-col rounded-2xl shadow-2xl bg-zinc-950 border border-zinc-800 overflow-hidden max-h-[85vh]"
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Distraction Report
            </h2>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-grow flex flex-col gap-6">
            
            {/* Overview Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-red-500 mb-1">{currentSessionDistractions}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">This Session</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-white mb-1">{distractions.length}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">All Time Total</span>
              </div>
            </div>

            {/* Distraction List */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Distraction History</h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : distractions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                  <MonitorSmartphone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No distractions recorded yet.<br/>Great focus!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {distractions.map(d => {
                    const cleanApp = d.app_name.toLowerCase().endsWith('.exe') ? d.app_name.slice(0, -4) : d.app_name;
                    return (
                      <div key={d.id} className="flex gap-3 items-start p-3 bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-bold text-white capitalize truncate pr-2">{cleanApp}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(d.timestamp), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{d.window_title}</p>
                          {d.reason && (
                            <p className="text-[10px] text-red-400 mt-1 uppercase tracking-wide font-semibold">
                              AI Tag: {d.reason.replace(/_/g, ' ')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
