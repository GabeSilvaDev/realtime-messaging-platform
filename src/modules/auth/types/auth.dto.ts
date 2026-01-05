import type { TokenPair } from './auth.types';

export interface RegisterDTO {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponseDTO {
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
  };
  tokens: TokenPair;
}

export interface RefreshResponseDTO {
  tokens: TokenPair;
}

export interface ForgotPasswordDTO {
  email: string;
}

export interface ResetPasswordDTO {
  token: string;
  newPassword: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}
