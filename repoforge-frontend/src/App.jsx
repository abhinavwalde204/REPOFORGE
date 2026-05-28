import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import SharedAnalysis from './pages/SharedAnalysis';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import CodeAnalyzerPage from './pages/CodeAnalyzerPage';
import { Loader2 } from 'lucide-react';

// Protected Route Guard for Secure Paths
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#030303]">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
        <span className="text-zinc-400 text-sm font-semibold tracking-wide">Restoring Session...</span>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Public Route Guard (Redirects away from Login/Register if already verified session)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#030303]">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
        <span className="text-zinc-400 text-sm font-semibold tracking-wide">Checking Session...</span>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    // Run Session check once during initial app boot
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Authentication pathways */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } 
        />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/shared/:token" element={<SharedAnalysis />} />

        {/* Protected Dashboard Pathway */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analysis/:id" 
          element={
            <ProtectedRoute>
              <Analysis />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analysis/:id/code/*" 
          element={
            <ProtectedRoute>
              <CodeAnalyzerPage />
            </ProtectedRoute>
          } 
        />

        {/* Wildcard session fallback redirects home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
