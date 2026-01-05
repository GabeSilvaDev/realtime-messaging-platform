import { z } from 'zod';

const email = z.email({ message: 'Email inválido' }).toLowerCase().trim();

const password = z
  .string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter número')
  .regex(/[^a-zA-Z0-9]/, 'Senha deve conter caractere especial');

const username = z
  .string()
  .min(3, 'Username deve ter pelo menos 3 caracteres')
  .max(30, 'Username deve ter no máximo 30 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e _')
  .toLowerCase()
  .trim();

export const registerSchema = z.object({
  username,
  email,
  password,
  displayName: z.string().min(2).max(100).trim().optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
