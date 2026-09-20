import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase automatically handles hash tokens, but for PKCE ?code= flow:
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Error exchanging code:', error);
          navigate('/auth');
          return;
        }
      }

      await initialize();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
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