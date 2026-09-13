import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const handleCallback = async () => {
      await initialize();
      const token = localStorage.getItem('prodify_access_token');
      if (token) {
        navigate('/');
      } else {
        navigate('/auth');
      }
    };
    handleCallback();
  }, [navigate, initialize]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}