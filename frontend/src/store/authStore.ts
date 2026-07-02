import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session, Subscription } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

let authSubscription: Subscription | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });

      // Clean up previous subscription if it exists
      if (authSubscription) {
        authSubscription.unsubscribe();
      }

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          set({
            session,
            user: session?.user ?? null,
            isAuthenticated: !!session,
          });
        }
      );

      authSubscription = subscription;
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ isLoading: false });
    }
  },

  signUp: async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      return {};
    } catch (err) {
      return { error: 'An unexpected error occurred during sign up.' };
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return {};
    } catch (err) {
      return { error: 'An unexpected error occurred during sign in.' };
    }
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('Google sign-in error:', error.message);
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, isAuthenticated: false });
  },

  getAccessToken: async () => {
    const { session } = get();
    if (session?.access_token) return session.access_token;

    const { data: { session: refreshed } } = await supabase.auth.getSession();
    return refreshed?.access_token ?? null;
  },
}));