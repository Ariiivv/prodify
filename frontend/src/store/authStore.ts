import { create } from 'zustand';
import { API_BASE } from '@/lib/config';

export interface User {
  id: number;
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
  signInWithGoogleToken: (credential: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  devLogin: () => void;
}

const API_URL = `${API_BASE}/api/auth`;
const TOKEN_KEY = 'prodify_access_token';
const USER_KEY = 'prodify_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const cachedUser = localStorage.getItem(USER_KEY);

      if (!token) {
        set({ user: null, session: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Optimistic: hydrate from cache immediately so the UI doesn't flash
      if (cachedUser) {
        try {
          const parsedUser = JSON.parse(cachedUser);
          set({
            session: { access_token: token },
            user: parsedUser,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Corrupt cache, will revalidate below
        }
      }

      // Validate token with backend
      let response: Response;
      try {
        response = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Backend unreachable — trust the cached session if available
        if (cachedUser) {
          set({ isLoading: false });
          return;
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        set({ user: null, session: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (response.ok) {
        const userData: User = await response.json();
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        set({
          session: { access_token: token },
          user: userData,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // Token expired or invalid — clear everything
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        set({ user: null, session: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ user: null, session: null, isAuthenticated: false, isLoading: false });
    }
  },

  signUp: async (email: string, password: string, username?: string) => {
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { error: data.detail || `Registration failed (${response.status}).` };
      }

      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      set({
        session: { access_token: data.access_token },
        user: data.user,
        isAuthenticated: true,
      });

      return {};
    } catch (err) {
      console.error('Sign up error:', err);
      return { error: 'Network error occurred during registration.' };
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { error: data.detail || 'Invalid email or password.' };
      }

      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      set({
        session: { access_token: data.access_token },
        user: data.user,
        isAuthenticated: true,
      });

      return {};
    } catch (err) {
      console.error('Sign in error:', err);
      return { error: 'Network error occurred during login.' };
    }
  },

  signInWithGoogleToken: async (credential: string) => {
    try {
      const response = await fetch(`${API_URL}/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { error: data.detail || 'Google sign-in failed.' };
      }

      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      set({
        session: { access_token: data.access_token },
        user: data.user,
        isAuthenticated: true,
      });

      return {};
    } catch (err) {
      console.error('Google token exchange error:', err);
      return { error: 'Network error during Google authentication.' };
    }
  },

  signInWithGoogle: async () => {
    console.warn('Use signInWithGoogleToken via @react-oauth/google component.');
  },

  signOut: async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, session: null, isAuthenticated: false });
  },

  getAccessToken: async () => {
    const { session } = get();
    if (session?.access_token) return session.access_token;
    return localStorage.getItem(TOKEN_KEY) ?? null;
  },

  devLogin: () => {
    const devUser: any = { id: 'dev-user', email: 'dev@prodify.local', name: 'Ariv', username: 'Ariv', auth_provider: 'dev' };
    localStorage.setItem(TOKEN_KEY, 'dev-token');
    localStorage.setItem(USER_KEY, JSON.stringify(devUser));
    set({
      user: devUser,
      session: { access_token: 'dev-token' },
      isAuthenticated: true,
    });
  },
}));
