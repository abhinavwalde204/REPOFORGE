import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react';
import gsap from 'gsap';
import useAuthStore from '../store/authStore';

const VerifyEmail = () => {
  const { token } = useParams();
  const { verifyEmail, error, isLoading, clearError } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState('');
  const [isVerified, setIsVerified] = useState(null);
  
  const cardRef = useRef(null);
  const logoRef = useRef(null);

  useEffect(() => {
    clearError();
    
    const ctx = gsap.context(() => {
      gsap.from(logoRef.current, { y: -30, opacity: 0, duration: 1, ease: 'power4.out' });
      gsap.from(cardRef.current, { y: 40, opacity: 0, duration: 1.2, delay: 0.2, ease: 'power4.out' });
    });

    const triggerVerification = async () => {
      if (!token) { setIsVerified(false); return; }
      const result = await verifyEmail(token);
      if (result.success) {
        setIsVerified(true);
        setSuccessMsg(result.message);
      } else {
        setIsVerified(false);
      }
    };

    triggerVerification();
    return () => ctx.revert();
  }, [token]);

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

      <div ref={cardRef} className="w-full max-w-md glass-panel p-8 rounded-3xl border border-zinc-800/80 relative text-center">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Verifying Your Email</h2>
            <p className="text-zinc-400 text-sm">Please wait while we validate your credentials...</p>
          </div>
        ) : isVerified === true ? (
          <div>
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-green-950/30 border border-green-500/30 text-green-400 mb-6 shadow-[0_0_25px_rgba(34,197,94,0.15)]">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-3">Email Verified!</h2>
            <p className="text-zinc-300 leading-relaxed mb-6">
              {successMsg || 'Your email address has been successfully verified. You are now ready to map your codebases!'}
            </p>
            <Link
              to="/login"
              className="inline-flex glow-btn w-full justify-center bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(244,63,94,0.25)]"
            >
              Sign In to RepoForge
            </Link>
          </div>
        ) : (
          <div>
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-red-950/30 border border-red-500/30 text-red-400 mb-6 shadow-[0_0_25px_rgba(239,68,68,0.15)]">
              <XCircle className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-3">Verification Failed</h2>
            <p className="text-zinc-300 leading-relaxed mb-6">
              {error || 'This verification link is invalid, expired, or has already been used.'}
            </p>
            <div className="flex flex-col space-y-3">
              <Link
                to="/register"
                className="inline-flex glow-btn w-full justify-center bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(244,63,94,0.25)]"
              >
                Create New Account
              </Link>
              <Link to="/login" className="text-zinc-400 hover:text-zinc-300 text-sm font-medium py-2 transition-colors">
                Back to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
