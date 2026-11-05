import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import AppLayout from './components/layout/AppLayout';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import ProtectedRoute from './components/auth/ProtectedRoute';
import TrackingConsentModal from './components/auth/TrackingConsentModal';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onOpenUrl, getCurrent } from '@tauri-apps/plugin-deep-link';
import { supabase } from '@/lib/supabase';

// Route-based code splitting - heavy pages are loaded on-demand
const HomePage = lazy(() => import('./pages/HomePage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const Report = lazy(() => import('./pages/Report'));
const Settings = lazy(() => import('./pages/Settings'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const PrivateSpace = lazy(() => import('./pages/PrivateSpace'));

const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    let timerCleared = false;
    const fallbackTimer = setTimeout(() => {
      if (timerCleared) return;
      if (useAuthStore.getState().isLoading) {
        console.warn('[App] Auth init timed out after 3s (cold start safety fallback). Releasing loading screen.');
        useAuthStore.setState({ isLoading: false });
      }
    }, 3000);

    initialize().finally(() => {
      timerCleared = true;
      clearTimeout(fallbackTimer);
    });

    let unlisten: (() => void) | undefined;

    const processUrls = async (urls: string[] | string | null) => {
      if (!urls) return;
      const urlArray = Array.isArray(urls) ? urls : [urls];

      for (const url of urlArray) {
        if (url && url.includes('prodify://auth/callback')) {
          if (sessionStorage.getItem('processed_deep_link') === url) continue;
          sessionStorage.setItem('processed_deep_link', url);

          try {
            const cleanUrl = url.replace(/^["'[]+|["'\]]+$/g, '').trim();
            const parsedUrl = new URL(cleanUrl);

            const errCode =
              parsedUrl.searchParams.get('error') ||
              new URLSearchParams(parsedUrl.hash.substring(1)).get('error');
            const errDesc =
              parsedUrl.searchParams.get('error_description') ||
              new URLSearchParams(parsedUrl.hash.substring(1)).get('error_description');
            if (errCode) {
              throw new Error(`${errCode}: ${errDesc || 'Unknown error'}`);
            }

            const code = parsedUrl.searchParams.get('code');

            if (code) {
              const { error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) throw error;
            } else {
              const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
              const access_token = hashParams.get('access_token');
              const refresh_token = hashParams.get('refresh_token');

              if (access_token && refresh_token) {
                const { error } = await supabase.auth.setSession({
                  access_token,
                  refresh_token,
                });
                if (error) throw error;
              }
            }

            await initialize();

            try {
              await getCurrentWindow().setFocus();
            } catch (focusErr) {
              console.error('Failed to focus window:', focusErr);
            }

            window.location.href = '/';
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Deep link auth error:', err);
            alert(`Deep Link Error: ${errorMessage}\nURL: ${url}`);
            window.location.href = '/auth';
          }
        }
      }
    };

    getCurrent()
      .then(processUrls)
      .catch((err: unknown) => console.error('getCurrent error:', err));

    onOpenUrl(processUrls)
      .then((u) => {
        unlisten = u;
      })
      .catch((err: unknown) => console.error('Failed to setup deep link listener:', err));

    return () => {
      timerCleared = true;
      clearTimeout(fallbackTimer);
      if (unlisten) unlisten();
    };
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TrackingConsentModal />
        <Toaster richColors position="top-right" style={{ zIndex: 9999 }} />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
                <Route path="/workspace/:id" element={<Suspense fallback={<PageLoader />}><WorkspacePage /></Suspense>} />
                <Route path="/friends" element={<Suspense fallback={<PageLoader />}><FriendsPage /></Suspense>} />
                <Route path="/report" element={<Suspense fallback={<PageLoader />}><Report /></Suspense>} />
                <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><Report /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                <Route path="/private-space" element={<Suspense fallback={<PageLoader />}><PrivateSpace /></Suspense>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;