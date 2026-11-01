import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, User as UserIcon, ShieldCheck } from 'lucide-react';
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

  const { signIn, signUp, devLogin } = useAuthStore();
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


  const toggleMode = (newMode: AuthMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#1f1e1d] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle warm ambient background glow */}
      <div className="absolute -top-40 -right-40 w-[450px] h-[450px] bg-[#d97757]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[450px] h-[450px] bg-[#30302e]/30 rounded-full blur-[140px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#262624] border border-[#3d3d3a] shadow-md mb-3 text-[#d97757]">
            <Sparkles className="w-6 h-6 text-[#d97757]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#faf9f5]">Prodify</h1>
          <p className="text-sm text-[#a3a299] mt-1 font-body">
            {mode === 'login' ? 'Welcome back to your focus sanctuary' : 'Start your AI-powered productivity journey'}
          </p>
        </div>

        {/* Warm Charcoal Auth Card */}
        <motion.div
          layout
          className="rounded-2xl border border-[#3d3d3a] bg-[#262624] shadow-2xl shadow-black/60 p-7 sm:p-8"
        >
          {/* Mode Switcher Tabs */}
          <div className="flex mb-6 bg-[#1f1e1d] rounded-xl p-1 border border-[#3d3d3a]">
            <button
              type="button"
              onClick={() => toggleMode('login')}
              className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all duration-200 relative cursor-pointer ${
                mode === 'login'
                  ? 'text-[#faf9f5]'
                  : 'text-[#a3a299] hover:text-[#faf9f5]'
              }`}
            >
              {mode === 'login' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#30302e] border border-[#3d3d3a] rounded-lg -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              Sign In
            </button>
            <button
              type="button"
              onClick={() => toggleMode('signup')}
              className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all duration-200 relative cursor-pointer ${
                mode === 'signup'
                  ? 'text-[#faf9f5]'
                  : 'text-[#a3a299] hover:text-[#faf9f5]'
              }`}
            >
              {mode === 'signup' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#30302e] border border-[#3d3d3a] rounded-lg -z-10 shadow-sm"
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
                className="mb-5 px-4 py-3 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 flex items-start gap-2.5 shadow-sm"
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
                className="mb-5 px-4 py-3 rounded-xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-start gap-2.5 shadow-sm"
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
                  <label className="text-xs font-medium text-[#a3a299] block">
                    Username <span className="text-[#a3a299]/60 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a299]" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g., Alex Focus"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1f1e1d] border border-[#3d3d3a] text-[#faf9f5] text-sm placeholder:text-[#a3a299]/40 focus:outline-none focus:ring-1 focus:ring-[#d97757] focus:border-[#d97757] transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#a3a299] block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a299]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#1f1e1d] border text-[#faf9f5] text-sm placeholder:text-[#a3a299]/40 focus:outline-none focus:ring-1 transition-all ${
                    email && !isEmailValid
                      ? 'border-red-500/50 focus:ring-red-500/30 focus:border-red-500'
                      : email && isEmailValid
                      ? 'border-emerald-500/50 focus:ring-emerald-500/30 focus:border-emerald-500'
                      : 'border-[#3d3d3a] focus:ring-[#d97757]/40 focus:border-[#d97757]'
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
              <label className="text-xs font-medium text-[#a3a299] block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a299]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters with letters/numbers' : 'Enter your password'}
                  minLength={mode === 'signup' ? 8 : 1}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#1f1e1d] border border-[#3d3d3a] text-[#faf9f5] text-sm placeholder:text-[#a3a299]/40 focus:outline-none focus:ring-1 focus:ring-[#d97757] focus:border-[#d97757] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#a3a299] hover:text-[#faf9f5] transition-colors cursor-pointer"
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
                      <span className="text-[#a3a299] flex items-center gap-1 font-mono">
                        <ShieldCheck className="w-3 h-3 text-[#a3a299]" />
                        Security Strength
                      </span>
                      <span className={`font-semibold font-mono ${
                        passwordStrength.score === 4 ? 'text-emerald-400' :
                        passwordStrength.score === 3 ? 'text-blue-400' :
                        passwordStrength.score === 2 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#1f1e1d] border border-[#3d3d3a] overflow-hidden flex gap-1 p-0.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 rounded-full transition-all duration-300 ${
                            passwordStrength.score >= step ? passwordStrength.color : 'bg-[#30302e]'
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
              className="w-full py-2.5 rounded-xl bg-[#d97757] hover:bg-[#c86b4c] active:bg-[#b85b3c] text-[#faf9f5] text-sm font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 cursor-pointer border border-[#d97757]"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-[#faf9f5]" />}
              {isSubmitting
                ? mode === 'login' ? 'Signing in...' : 'Creating account...'
                : mode === 'login' ? 'Sign In' : 'Create Account'
              }
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#3d3d3a]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-mono font-medium">
              <span className="bg-[#262624] px-3 text-[#a3a299]">Or continue with</span>
            </div>
          </div>

          {/* Google Sign-In Container */}
          <div className="flex justify-center w-full">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setIsSubmitting(true);
                useAuthStore.getState().signInWithGoogle().finally(() => setIsSubmitting(false));
              }}
              className="w-full py-2.5 rounded-xl bg-[#d97757] hover:bg-[#c86b4c] active:bg-[#b85b3c] text-[#faf9f5] text-sm font-semibold border border-[#d97757] transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-40"
            >
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center p-0.5 shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <span>Continue with Google</span>
            </button>
          </div>

          {import.meta.env.DEV && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  devLogin();
                  navigate('/');
                }}
                className="px-4 py-2 bg-[#30302e] hover:bg-[#3d3d3a] text-[#faf9f5] text-xs font-mono rounded-lg border border-[#3d3d3a] transition-colors flex items-center gap-2 cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Dev Bypass Login
              </button>
            </div>
          )}

          {/* Toggle Mode Link Footer */}
          <p className="text-center mt-6 text-xs text-[#a3a299]">
            {mode === 'login' ? "Don't have an account yet?" : 'Already registered?'}
            <button
              type="button"
              onClick={() => toggleMode(mode === 'login' ? 'signup' : 'login')}
              className="ml-1.5 text-[#d97757] hover:text-[#c86b4c] font-semibold transition-colors underline underline-offset-4 decoration-[#d97757]/40 cursor-pointer"
            >
              {mode === 'login' ? 'Sign up for free' : 'Sign in to account'}
            </button>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}