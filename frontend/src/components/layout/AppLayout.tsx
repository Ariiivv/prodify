import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, BarChart3, Sparkles, LogOut, User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import ProfileModal from './ProfileModal';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/#workspaces', icon: LayoutGrid, label: 'Workspaces' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout() {
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-20 z-50 flex-col items-center py-8 border-r border-[#2a2a2a] bg-[#111111] overflow-hidden">
        <Link to="/" className="mb-12 flex flex-col items-center gap-1">
          <div className="w-10 h-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded flex items-center justify-center transition-colors hover:text-white text-muted-foreground">
            <Sparkles className="w-5 h-5" />
          </div>
        </Link>

        <nav className="flex flex-col gap-6 flex-1 w-full mt-4">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path || (path === '/#workspaces' && location.hash === '#workspaces');
            return (
              <Link
                key={path}
                to={path}
                className="relative group flex flex-col items-center gap-1.5 w-full"
              >
                <div className={`w-10 h-10 flex items-center justify-center transition-all duration-200 rounded ${
                  isActive
                    ? 'bg-[#e8ff47]/10 text-[#e8ff47]'
                    : 'text-muted-foreground hover:text-white hover:bg-[#1a1a1a]'
                }`}>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 w-[2px] h-6 bg-[#e8ff47]"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-[#666666] font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div className="mt-auto flex flex-col items-center gap-6 w-full">
          {/* Avatar (Clickable to open profile) */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="relative group flex flex-col items-center gap-1.5 w-full"
          >
            <div className="w-10 h-10 bg-[#1a1a1a] flex items-center justify-center text-muted-foreground hover:text-[#e8ff47] hover:border hover:border-[#e8ff47] transition-all rounded">
              <User className="w-5 h-5" />
            </div>
            <span className="text-xs text-[#666666] font-medium">Profile</span>
          </button>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="relative group flex flex-col items-center gap-1.5 w-full"
          >
            <div className="w-10 h-10 flex items-center justify-center text-prodify-muted hover:text-prodify-danger hover:bg-prodify-danger/10 transition-all rounded">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-xs text-[#666666] font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-prodify-surface border-t border-prodify-border">
        <nav className="flex justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-1 px-3 py-1 transition-all ${
                  isActive ? 'text-prodify-accent' : 'text-prodify-muted'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center gap-1 px-3 py-1 text-prodify-muted"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">Sign Out</span>
          </button>
        </nav>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
}
