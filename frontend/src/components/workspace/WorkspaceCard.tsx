import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, Timer, ArrowRight, Flame, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { API_BASE } from '@/lib/config';
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspace.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json();
        console.error(err);
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      // Optimistic UI update: remove from local state via callback
      onDeleted?.(workspace.id);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Edit triggered');
  };

  return (
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
                <DropdownMenuItem onClick={handleDelete} className="cursor-pointer rounded-lg text-red-400 hover:text-red-300 focus:text-red-300">
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
            {workspace.work_duration || 45}m
          </span>
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3" />
            {workspace.mode || 'structured'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}