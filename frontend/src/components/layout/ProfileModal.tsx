import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, initialize } = useAuthStore();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.full_name || '');
      setAge(user.age ? String(user.age) : '');
    }
  }, [isOpen, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const payload = {
        full_name: fullName.trim(),
        age: age ? parseInt(age) : 0,
      };

      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Failed to update profile');
      }

      toast.success("Profile updated successfully!");
      // Reload user data to reflect changes immediately
      await initialize();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-[#111111] border border-[#2a2a2a] p-6 shadow-2xl z-10"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-heading font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-[#e8ff47]" />
                Edit Profile
              </h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name (for AI Coach)</label>
                <Input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Ariv"
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Age (Optional)</label>
                <Input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g., 20"
                  min="1"
                  max="120"
                  className="bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                />
              </div>

              <div className="pt-4 border-t border-[#2a2a2a] flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="bg-transparent border-[#2a2a2a] text-white hover:bg-[#2a2a2a] rounded-none"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || !fullName.trim()}
                  className="bg-[#e8ff47] hover:bg-[#e8ff47]/90 text-black font-bold rounded-none"
                >
                  {isSaving ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
