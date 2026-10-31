import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, BarChart3, Sparkles, LogOut, Settings, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/#workspaces', icon: LayoutGrid, label: 'Tracks' },
  { path: '/friends', icon: Users, label: 'Friends' },
  { path: '/report', icon: BarChart3, label: 'Report' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout() {
  const location = useLocation();
  const { signOut } = useAuthStore();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[#18181b] text-[#f4f4f5]">
      {/* ── Desktop Sidebar: Fixed, scannable, Claude warm-charcoal aesthetic ── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-20 z-50 flex-col items-center py-6 px-3 border-r border-[#27272a] bg-[#18181b]/95 backdrop-blur-md select-none">
        {/* Brand mark */}
        <Link to="/" className="mb-8 flex flex-col items-center group">
          <div className="w-10 h-10 rounded-xl bg-[#202024] border border-[#27272a] flex items-center justify-center transition-all duration-150 group-hover:border-zinc-700 group-hover:bg-[#27272a] shadow-sm">
            <Sparkles className="w-[18px] h-[18px] text-zinc-300 group-hover:text-white" />
          </div>
        </Link>

        {/* Navigation list */}
        <nav className="flex flex-col gap-4 flex-1 w-full overflow-y-auto custom-scrollbar">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path || (path === '/#workspaces' && location.hash === '#workspaces');
            return (
              <Link
                key={path}
                to={path}
                className="relative group flex flex-col items-center gap-1 w-full"
              >
                <div
                  className={`relative w-11 h-11 flex items-center justify-center transition-all duration-150 rounded-xl ${
                    isActive
                      ? 'bg-[#27272a] text-[#f4f4f5] shadow-sm border border-[#3f3f46]/40'
                      : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#202024]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 w-[2px] h-5 rounded-r bg-zinc-200"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                <span
                  className={`text-[11px] font-medium tracking-tight transition-colors ${
                    isActive ? 'text-[#f4f4f5] font-semibold' : 'text-[#a1a1aa] group-hover:text-zinc-200'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User / Sign Out Footer */}
        <div className="mt-auto flex flex-col items-center gap-4 w-full pt-4 border-t border-[#27272a]/60">
          <button
            onClick={handleSignOut}
            className="relative group flex flex-col items-center gap-1 w-full"
            title="Sign Out"
          >
            <div className="w-11 h-11 flex items-center justify-center text-[#a1a1aa] hover:text-rose-400 hover:bg-[#202024] transition-all duration-150 rounded-xl">
              <LogOut className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[11px] text-[#a1a1aa] group-hover:text-rose-400 font-medium tracking-tight transition-colors">
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#18181b]/95 border-t border-[#27272a] backdrop-blur-md">
        <nav className="flex justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                  isActive ? 'text-[#f4f4f5] font-medium' : 'text-[#a1a1aa]'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="text-[10px]">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center gap-1 px-3 py-1 text-[#a1a1aa] hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="text-[10px]">Sign Out</span>
          </button>
        </nav>
      </div>

      {/* ── Main Viewport Area ── */}
      <main className="md:ml-20 min-h-screen overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
