import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://meesho-website.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // 60 seconds tolerance for Render cold-starts
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor with automatic retry for Render spin-up cold starts (502/503/504)
api.interceptors.response.use(
  (res) => {
    // Dismiss wake-up notification if it was showing
    toast.dismiss('backend-cold-start');
    return res;
  },
  async (error: AxiosError) => {
    const config = error.config as any;

    // Handle 401 globally — logout user
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Detect Render cold-start indicators (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout, or Network Timeout)
    const isColdStart =
      !error.response ||
      error.response.status === 502 ||
      error.response.status === 503 ||
      error.response.status === 504 ||
      error.code === 'ECONNABORTED';

    if (config && isColdStart) {
      config._retryCount = config._retryCount || 0;
      const MAX_RETRIES = 3;

      if (config._retryCount < MAX_RETRIES) {
        config._retryCount += 1;
        const delayMs = config._retryCount * 2500; // 2.5s, 5s, 7.5s

        // Inform user that backend is waking up
        toast.loading(
          'Connecting to server (waking up from idle)... please hold on',
          { id: 'backend-cold-start', duration: 15000 }
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return api(config);
      } else {
        toast.error('Server is taking longer than usual to wake up. Please refresh.', { id: 'backend-cold-start' });
      }
    }

    return Promise.reject(error);
  }
);

export default api;
