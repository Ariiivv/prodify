import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, LogOut, AlertTriangle, Shield, User, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function Settings() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const [isResetDialogVisible, setResetDialogVisible] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = () => {
    signOut();
    navigate('/auth');
  };

  const executeDataReset = async () => {
    if (resetInput !== 'RESET') return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/users/me/reset-data`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to reset data');
      }

      const data = await response.json();
      toast.success(data.message || 'Data successfully reset.');
      setResetDialogVisible(false);
      navigate('/');
    } catch (error: any) {
      toast.error('Reset Failed', { description: error.message });
    } finally {
      setIsDeleting(false);
      setResetInput('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-card border border-border/40 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, account, and data.</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/20 flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
              <div className="bg-background/50 border border-border/40 text-foreground rounded-md px-3 py-2 text-sm max-w-md">
                {user?.username || 'N/A'}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <div className="bg-background/50 border border-border/40 text-foreground rounded-md px-3 py-2 text-sm max-w-md opacity-80">
                {user?.email || 'N/A'}
              </div>
            </div>
          </div>
        </section>

        {/* Account Section */}
        <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/20 flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Account</h2>
          </div>
          <div className="p-6 flex flex-col items-start gap-4">
            <div className="text-sm text-muted-foreground">
              Your account is authenticated securely via {user?.auth_provider === 'dev' ? 'Local Dev Bypass' : 'Supabase (Google/Email)'}.
            </div>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="bg-transparent border-border/40 text-foreground hover:bg-white/5"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </section>

        {/* Data & Privacy Section */}
        <section className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-500/10 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-500">Data & Privacy</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-red-400/80 max-w-xl">
              Permanently delete ALL your workspaces, focus session history, distraction patterns, AI coaching memory, and chat history. Your account will be reset to a completely blank state, as if you just signed up.
            </p>
            <Button
              onClick={() => {
                setResetInput('');
                setResetDialogVisible(true);
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Reset All My Data
            </Button>
          </div>
        </section>
      </div>

      {/* Reset Confirmation Dialog */}
      <AnimatePresence>
        {isResetDialogVisible && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); setResetDialogVisible(false); }}
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
                <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Reset All Data?
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                  This will permanently delete ALL your workspaces, focus session history, distraction patterns, AI coaching memory, and chat history. Your account will be reset to a completely blank state, as if you just signed up. <strong>This cannot be undone.</strong>
                </p>
                
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Type RESET to confirm</label>
                <input
                  type="text"
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder="RESET"
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-none px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                />
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  disabled={resetInput !== 'RESET' || isDeleting}
                  onClick={executeDataReset}
                  className="w-full py-2.5 text-sm font-semibold text-white transition-colors rounded-none disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
                >
                  {isDeleting ? 'Resetting...' : 'Permanently Reset'}
                </button>
                <button
                  onClick={() => setResetDialogVisible(false)}
                  disabled={isDeleting}
                  className="w-full py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors rounded-none border border-[#2a2a2a] bg-[#111111]"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
