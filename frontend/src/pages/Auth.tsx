import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, User as UserIcon, ShieldCheck } from 'lucide-react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuthStore } from '@/store/authStore';

type AuthMode = 'login' | 'signup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { signIn, signUp, signInWithGoogleToken, devLogin } = useAuthStore();
  const navigate = useNavigate();

  // --- Real-time Email Validation ---
  const isEmailValid = useMemo(() => {
    if (!email.trim()) return false;
    return EMAIL_REGEX.test(email.trim());
  }, [email]);

  // --- Smart Password Complexity Score ---
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: 'None', color: 'bg-border' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    switch (score) {
      case 1:
        return { score: 1, label: 'Weak', color: 'bg-red-500' };
      case 2:
        return { score: 2, label: 'Medium', color: 'bg-amber-500' };
      case 3:
        return { score: 3, label: 'Strong', color: 'bg-blue-500' };
      case 4:
        return { score: 4, label: 'Excellent', color: 'bg-emerald-500' };
      default:
        return { score: 1, label: 'Weak', color: 'bg-red-500' };
    }
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!isEmailValid) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'signup' && passwordStrength.score < 2) {
      setError('Password is too weak. Include at least 8 characters and numbers or uppercase letters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, username.trim() || undefined);

      if (result.error) {
        setError(result.error);
      } else {
        if (mode === 'login') {
          navigate('/');
        } else {
          setSuccessMsg('Account created successfully! Welcome to Prodify.');
          setTimeout(() => {
            navigate('/');
          }, 1200);
        }
      }
    } catch {
      setError('An unexpected network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setError(null);
    setSuccessMsg(null);
    if (!credentialResponse.credential) {
      setError('No credential received from Google.');
      return;
    }

    setIsSubmitting(true);
    const result = await signInWithGoogleToken(credentialResponse.credential);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      navigate('/');
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In failed. Please verify your internet connection or Google Client ID.');
  };

  const toggleMode = (newMode: AuthMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glowing gradient orbs */}
      <div className="absolute -top-40 -right-40 w-[450px] h-[450px] bg-primary/15 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-[450px] h-[450px] bg-violet-600/15 rounded-full blur-[140px] pointer-events-none animate-pulse" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        {/* Header Branding */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-violet-500 to-indigo-600 shadow-lg shadow-primary/25 mb-4"
          >
            <Sparkles className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Prodify</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'login' ? 'Welcome back to your focus sanctuary' : 'Start your AI-powered productivity journey'}
          </p>
        </div>

        {/* Glassmorphic Auth Card */}
        <motion.div
          layout
          className="rounded-3xl border border-white/10 bg-card/75 backdrop-blur-2xl shadow-2xl shadow-black/40 p-8"
        >
          {/* Mode Switcher Tabs */}
          <div className="flex mb-6 bg-secondary/60 rounded-2xl p-1.5 border border-border/40">
            <button
              type="button"
              onClick={() => toggleMode('login')}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-200 relative ${
                mode === 'login'
                  ? 'text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'login' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-lg shadow-primary/30"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              Sign In
            </button>
            <button
              type="button"
              onClick={() => toggleMode('signup')}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-200 relative ${
                mode === 'signup'
                  ? 'text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'signup' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-lg shadow-primary/30"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              Create Account
            </button>
          </div>

          {/* Status Banners (Errors & Success) */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-5 px-4 py-3 rounded-2xl text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 flex items-start gap-2.5 shadow-sm"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-5 px-4 py-3 rounded-2xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-start gap-2.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Smart Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Field (Only for Sign Up) */}
            <AnimatePresence mode="wait">
              {mode === 'signup' && (
                <motion.div
                  key="username-field"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden space-y-1.5"
                >
                  <label className="text-xs font-medium text-muted-foreground block">
                    Username <span className="text-muted-foreground/60 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g., Alex Focus"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/40 border border-border/50 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-secondary/40 border text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 transition-all ${
                    email && !isEmailValid
                      ? 'border-red-500/50 focus:ring-red-500/30'
                      : email && isEmailValid
                      ? 'border-emerald-500/50 focus:ring-emerald-500/30'
                      : 'border-border/50 focus:ring-primary/40 focus:border-primary/60'
                  }`}
                />
                {email && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {isEmailValid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters with letters/numbers' : 'Enter your password'}
                  minLength={mode === 'signup' ? 8 : 1}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-secondary/40 border border-border/50 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Live Password Complexity Bar (Only for Sign Up when typing) */}
              <AnimatePresence>
                {mode === 'signup' && password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-1 overflow-hidden"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-muted-foreground" />
                        Security Strength
                      </span>
                      <span className={`font-semibold ${
                        passwordStrength.score === 4 ? 'text-emerald-400' :
                        passwordStrength.score === 3 ? 'text-blue-400' :
                        passwordStrength.score === 2 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary/80 overflow-hidden flex gap-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 rounded-full transition-all duration-300 ${
                            passwordStrength.score >= step ? passwordStrength.color : 'bg-border/30'
                          }`}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (mode === 'signup' && passwordStrength.score < 2) || !isEmailValid}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-violet-600 text-white text-sm font-semibold hover:opacity-95 shadow-lg shadow-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting
                ? mode === 'login' ? 'Signing in...' : 'Creating account...'
                : mode === 'login' ? 'Sign In' : 'Create Account'
              }
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider font-semibold">
              <span className="bg-card px-3 text-muted-foreground/70">Or continue with</span>
            </div>
          </div>

          {/* Google Sign-In Container */}
          <div className="flex justify-center w-full overflow-hidden">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="filled_black"
              shape="pill"
              size="large"
              width="340"
              useOneTap
            />
          </div>

          {import.meta.env.DEV && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  devLogin();
                  navigate('/');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono rounded-lg border border-slate-600 transition-colors flex items-center gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Dev Bypass Login
              </button>
            </div>
          )}

          {/* Toggle Mode Link Footer */}
          <p className="text-center mt-6 text-xs text-muted-foreground">
            {mode === 'login' ? "Don't have an account yet?" : 'Already registered?'}
            <button
              type="button"
              onClick={() => toggleMode(mode === 'login' ? 'signup' : 'login')}
              className="ml-1.5 text-primary hover:text-primary/80 font-semibold transition-colors underline underline-offset-4 decoration-primary/30"
            >
              {mode === 'login' ? 'Sign up for free' : 'Sign in to account'}
            </button>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}