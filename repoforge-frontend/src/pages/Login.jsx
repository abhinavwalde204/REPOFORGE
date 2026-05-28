import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import gsap from 'gsap';
import useAuthStore from '../store/authStore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  
  const { login, error, isLoading, clearError } = useAuthStore();
  const navigate = useNavigate();
  
  const cardRef = useRef(null);
  const logoRef = useRef(null);

  useEffect(() => {
    clearError();
    setFormError('');
    
    const ctx = gsap.context(() => {
      gsap.from(logoRef.current, { y: -30, opacity: 0, duration: 1, ease: 'power4.out' });
      gsap.from(cardRef.current, { y: 40, opacity: 0, duration: 1.2, delay: 0.2, ease: 'power4.out' });
    });
    
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (!email || !password) {
      setFormError('Please fill in all fields');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      gsap.to(cardRef.current, {
        scale: 0.95,
        opacity: 0,
        duration: 0.4,
        onComplete: () => navigate('/')
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 relative">
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-rose-600/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-orange-600/8 blur-[100px] pointer-events-none" />

      <div ref={logoRef} className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-zinc-900 border border-rose-500/30 mb-3 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
          <Sparkles className="w-8 h-8 text-rose-400 text-glow" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight m-0">
          Repo<span className="gradient-text">Forge</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Interactive architecture mapping &amp; adaptive refactoring</p>
      </div>

      <div
        ref={cardRef}
        className="w-full max-w-md glass-panel p-8 rounded-3xl border border-zinc-800/80 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
        
        <h2 className="text-2xl font-bold text-zinc-100 text-center mb-6">Welcome Back</h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
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
            <label className="text-xs font-semibold text-zinc-400 tracking-wide uppercase block">Password</label>
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
                <span>Sign In</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-zinc-500 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-rose-400 hover:text-rose-300 font-semibold transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
