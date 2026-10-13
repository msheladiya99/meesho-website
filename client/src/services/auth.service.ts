import api from '../lib/axios';
import type { ApiResponse, User } from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', { email, password }),

  me: () => api.get<ApiResponse<User>>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const usersApi = {
  list: () => api.get<ApiResponse<User[]>>('/users'),
  create: (data: Partial<User> & { password: string }) => api.post('/users', data),
  update: (id: string, data: Partial<User>) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
};
