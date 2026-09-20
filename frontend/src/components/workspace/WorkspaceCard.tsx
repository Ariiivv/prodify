import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, Timer, ArrowRight, Flame, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Workspace {
  id: number;
  name: string;
  mode?: string;
  work_duration?: number;
  description?: string;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  index?: number;
  onDeleted?: (workspaceId: number) => void;
}

export default function WorkspaceCard({ workspace, index = 0, onDeleted }: WorkspaceCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

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
    console.log('Edit triggered');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ y: -4, transition: { duration: 0.18 } }}
        onClick={() => navigate(`/workspace/${workspace.id}`)}
        className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5 cursor-pointer overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-1">
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={handleDeleteClick}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <button
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border-border/50 bg-card shadow-xl">
                  <DropdownMenuItem onClick={handleEdit} className="cursor-pointer rounded-lg">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer rounded-lg text-red-400 hover:text-red-300 focus:text-red-300">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">{workspace.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {workspace.description || `${workspace.mode || 'structured'} focus mode`}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {workspace.work_duration || 25}m
            </span>
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" />
              {workspace.mode || 'structured'}
            </span>
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
