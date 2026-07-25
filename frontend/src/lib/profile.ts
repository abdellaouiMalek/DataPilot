import { api } from './api';

export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  organization: string | null;
  role: string | null;
}

export interface ProfilePayload {
  first_name: string;
  last_name: string;
  email: string;
  organization: string | null;
}

export const getProfile = () => api.get<UserProfile>('/api/profile');

export const updateProfile = (payload: ProfilePayload) =>
  api.put<UserProfile>('/api/profile', payload);
