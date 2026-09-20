import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface User {
  id: string | number;
  username: string;
  email: string;
  auth_provider: string;
  avatar_url?: string | null;
}

export interface Session {
  access_token: string;
  token_type?: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  devLogin: () => void;
}

const TOKEN_KEY = 'prodify_access_token';
const USER_KEY = 'prodify_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    set({ isLoading: true });
    
    // Support dev login bypass
    const token = localStorage.getItem(TOKEN_KEY);
    const cachedUser = localStorage.getItem(USER_KEY);
    if (token === 'dev-token' && cachedUser) {
      set({
        session: { access_token: 'dev-token' },
        user: JSON.parse(cachedUser),
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        throw error;
      }

      if (session) {
        const user: User = {
          id: session.user.id,
          email: session.user.email || '',
          username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User',
          auth_provider: session.user.app_metadata?.provider || 'email',
          avatar_url: session.user.user_metadata?.avatar_url || null,
        };

        set({
          session: { access_token: session.access_token },
          user,
          isAuthenticated: true,
        });
      } else {
        set({ user: null, session: null, isAuthenticated: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ user: null, session: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      // Ignore if currently in dev bypass
      if (get().session?.access_token === 'dev-token') return;

      if (session) {
        const user: User = {
          id: session.user.id,
          email: session.user.email || '',
          username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User',
          auth_provider: session.user.app_metadata?.provider || 'email',
          avatar_url: session.user.user_metadata?.avatar_url || null,
        };

        set({
          session: { access_token: session.access_token },
          user,
          isAuthenticated: true,
        });
      } else {
        set({
          session: null,
          user: null,
          isAuthenticated: false,
        });
      }
    });
  },

  signUp: async (email: string, password: string, username?: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      console.error('Sign up error:', err);
      return { error: 'Network error occurred during registration.' };
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      console.error('Sign in error:', err);
      return { error: 'Network error occurred during login.' };
    }
  },

  signInWithGoogle: async () => {
    try {
      const isTauri = '__TAURI_INTERNALS__' in window;

      if (isTauri) {
        // Tauri desktop environment: use deep link and external browser
        const { open } = await import('@tauri-apps/plugin-shell');
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'prodify://auth/callback',
            skipBrowserRedirect: true,
          },
        });
        
        if (error) {
          console.error('signInWithGoogle: Supabase error:', error);
          throw error;
        }
        
        if (data?.url) {
          try {
            await open(data.url);
          } catch (openErr) {
            console.error('signInWithGoogle: ERROR in Tauri shell open():', openErr);
          }
        }
      } else {
        // Standard web environment
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
    }
  },

  signOut: async () => {
    if (get().session?.access_token === 'dev-token') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({ user: null, session: null, isAuthenticated: false });
      return;
    }
    
    await supabase.auth.signOut();
    set({ user: null, session: null, isAuthenticated: false });
  },

  getAccessToken: async () => {
    const { session } = get();
    if (session?.access_token === 'dev-token') return 'dev-token';
    
    // For supabase, we can get the current session
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    return currentSession?.access_token || null;
  },

  devLogin: () => {
    const devUser: User = { id: 'dev-user', email: 'dev@prodify.local', username: 'Ariv', auth_provider: 'dev' };
    localStorage.setItem(TOKEN_KEY, 'dev-token');
    localStorage.setItem(USER_KEY, JSON.stringify(devUser));
    set({
      user: devUser,
      session: { access_token: 'dev-token' },
      isAuthenticated: true,
    });
  },
}));
