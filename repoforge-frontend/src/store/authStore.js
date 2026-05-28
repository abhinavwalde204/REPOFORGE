import { create } from 'zustand';
import api from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  history: JSON.parse(localStorage.getItem('repoforge-history') || '[]'),

  // Check auth state on mount/refresh
  checkAuth: async () => {
    const token = get().token;
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/auth/me');
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err) {
      console.error('Session restoration failed:', err.message);
      localStorage.removeItem('token');
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  },

  // Add to history
  addToHistory: (repoUrl, analysisId) => {
    const timestamp = Date.now();
    const historyItem = { repoUrl, analysisId, timestamp };
    set(state => {
      const newHistory = [historyItem, ...state.history];
      // Keep only last 10 items
      const limitedHistory = newHistory.slice(0, 10);
      localStorage.setItem('repoforge-history', JSON.stringify(limitedHistory));
      return { history: limitedHistory };
    });
  },

  // Clear history
  clearHistory: () => {
    set({ history: [] });
    localStorage.removeItem('repoforge-history');
  },

  // Update profile (name, email)
  updateProfile: (updates) => {
    set(state => ({
      user: { ...state.user, ...updates }
    }));
  },

  // Initiate password reset (send OTP to email)
  initiatePasswordReset: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/initiate-password-reset', { email });
      set({ isLoading: false });
      return { success: true, message: response.data.message };
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to initiate password reset.';
      set({ error: errMsg, isLoading: false });
      return { success: false, error: errMsg };
    }
  },

  // Reset password with OTP
  resetPassword: async (email, otp, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/reset-password', { email, otp, newPassword });
      set({ isLoading: false });
      return { success: true, message: response.data.message };
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to reset password.';
      set({ error: errMsg, isLoading: false });
      return { success: false, error: errMsg };
    }
  },

  // Account login
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      localStorage.setItem('token', token);
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false
      });
      return { success: true };
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to log in. Please check your credentials.';
      set({ error: errMsg, isLoading: false });
      return { success: false, error: errMsg };
    }
  },

  // Account registration
  register: async (name, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/register', { name, email, password });
      set({ isLoading: false });
      return { success: true, message: response.data.message };
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Registration failed. Try again.';
      const details = err.response?.data?.details;
      const fullError = details ? `${errMsg}: ${details.join(', ')}` : errMsg;
      set({ error: fullError, isLoading: false });
      return { success: false, error: fullError };
    }
  },

  // Verify email by token
  verifyEmail: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get(`/auth/verify/${token}`);
      set({ isLoading: false });
      return { success: true, message: response.data.message };
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Email verification failed.';
      set({ error: errMsg, isLoading: false });
      return { success: false, error: errMsg };
    }
  },

  // Stateless session logout
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Stateless server logout failed silently:', err.message);
    } finally {
      localStorage.removeItem('token');
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        error: null
      });
    }
  },

  // Clear current error status
  clearError: () => set({ error: null })
}));

export default useAuthStore;