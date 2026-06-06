import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, Timer, ArrowRight, Flame } from 'lucide-react';

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
}

export default function WorkspaceCard({ workspace, index = 0 }: WorkspaceCardProps) {
  const navigate = useNavigate();

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
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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