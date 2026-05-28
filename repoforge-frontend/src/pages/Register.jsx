import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, User, AlertCircle, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import gsap from 'gsap';
import useAuthStore from '../store/authStore';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { register, error, isLoading, clearError } = useAuthStore();
  
  const cardRef = useRef(null);
  const logoRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    clearError();
    setFormError('');
    
    const ctx = gsap.context(() => {
      gsap.from(logoRef.current, { y: -30, opacity: 0, duration: 1, ease: 'power4.out' });
      gsap.from(cardRef.current, { y: 40, opacity: 0, duration: 1.2, delay: 0.2, ease: 'power4.out' });
    });
    
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (isSuccess && successRef.current) {
      gsap.from(successRef.current, { scale: 0.9, opacity: 0, duration: 0.6, ease: 'elastic.out(1, 0.75)' });
    }
  }, [isSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (!name || !email || !password) {
      setFormError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return;
    }

    const result = await register(name, email, password);
    if (result.success) {
      setIsSuccess(true);
      setSuccessMessage(result.message || 'Check your email to verify your account');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 relative">
      <div className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-rose-600/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-72 h-72 rounded-full bg-orange-600/8 blur-[100px] pointer-events-none" />

      <div ref={logoRef} className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-zinc-900 border border-rose-500/30 mb-3 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
          <Sparkles className="w-8 h-8 text-rose-400 text-glow" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight m-0">
          Repo<span className="gradient-text">Forge</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Interactive architecture mapping &amp; adaptive refactoring</p>
      </div>

      {isSuccess ? (
        <div
          ref={successRef}
          className="w-full max-w-md glass-panel p-8 rounded-3xl border border-zinc-800/80 relative text-center"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
          
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-green-950/30 border border-green-500/30 text-green-400 mb-6 shadow-[0_0_25px_rgba(34,197,94,0.15)]">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          
          <h2 className="text-2xl font-bold text-zinc-100 mb-4">Registration Successful!</h2>
          <p className="text-zinc-300 leading-relaxed mb-6">
            We have sent a verification email. Please check your inbox and click the link to activate your account.
          </p>

          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-left mb-6">
            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">Development Notice</h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              If you are testing locally without a Resend API key, the verification link is printed directly to the <strong>repoforge-api backend terminal console logs</strong>.
            </p>
          </div>

          <Link
            to="/login"
            className="inline-flex glow-btn w-full justify-center bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(244,63,94,0.25)]"
          >
            Go to Login
          </Link>
        </div>
      ) : (
        <div
          ref={cardRef}
          className="w-full max-w-md glass-panel p-8 rounded-3xl border border-zinc-800/80 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
          
          <h2 className="text-2xl font-bold text-zinc-100 text-center mb-6">Create Account</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase block">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-black/40 border border-zinc-800 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 outline-none text-zinc-200 placeholder-zinc-600 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-black/40 border border-zinc-800 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 outline-none text-zinc-200 placeholder-zinc-600 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase block">Password (min 8 chars)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-black/40 border border-zinc-800 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 outline-none text-zinc-200 placeholder-zinc-600 transition-all"
                />
              </div>
            </div>

            {(formError || error) && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 flex items-start space-x-2 text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{formError || error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full glow-btn bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-bold py-3 rounded-xl flex justify-center items-center space-x-2 transition-all cursor-pointer shadow-[0_4px_20px_rgba(244,63,94,0.25)] hover:shadow-[0_4px_25px_rgba(244,63,94,0.4)] disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-zinc-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-rose-400 hover:text-rose-300 font-semibold transition-colors">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
