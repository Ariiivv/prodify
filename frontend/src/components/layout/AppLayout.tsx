import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-20 flex-col items-center py-8 border-r border-border/50 bg-card/50 backdrop-blur-xl">
        <Link to="/" className="mb-12">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
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
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 w-1 h-6 rounded-r-full bg-primary"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="w-5 h-5" />
                </div>
                <div className="absolute left-16 top-1/2 -translate-y-1/2 px-2 py-1 bg-card border border-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/90 backdrop-blur-xl border-t border-border/50">
        <nav className="flex justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}