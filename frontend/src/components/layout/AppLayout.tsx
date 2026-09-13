import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Sparkles, LogOut, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function AppLayout() {
  const location = useLocation();
  const { user, signOut } = useAuthStore();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-prodify-bg flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-20 flex-col items-center py-8 border-r border-prodify-border bg-prodify-surface">
        <Link to="/" className="mb-12">
          <div className="w-10 h-10 bg-prodify-accent flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-prodify-bg" />
          </div>
        </Link>

        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className="relative group"
              >
                <div className={`w-12 h-12 flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? 'bg-prodify-accent/10 text-prodify-accent'
                    : 'text-prodify-muted hover:text-white hover:bg-prodify-surface-alt'
                }`}>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 w-[2px] h-6 bg-prodify-accent"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="w-5 h-5" />
                </div>
                <div className="absolute left-16 top-1/2 -translate-y-1/2 px-2 py-1 bg-prodify-surface border border-prodify-border text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div className="mt-auto flex flex-col items-center gap-2">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-10 h-10 bg-prodify-surface-alt flex items-center justify-center text-prodify-muted hover:text-white transition-colors cursor-default">
              <User className="w-5 h-5" />
            </div>
            <div className="absolute left-16 bottom-0 px-3 py-2 bg-prodify-surface border border-prodify-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 min-w-[160px]">
              <p className="text-xs text-white font-medium truncate">
                {user?.email || 'User'}
              </p>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="relative group"
          >
            <div className="w-10 h-10 flex items-center justify-center text-prodify-muted hover:text-prodify-danger hover:bg-prodify-danger/10 transition-all">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="absolute left-16 top-1/2 -translate-y-1/2 px-2 py-1 bg-prodify-surface border border-prodify-border text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              Sign Out
            </div>
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
    </div>
  );
}
