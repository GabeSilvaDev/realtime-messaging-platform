import { z } from 'zod';
import { VALIDATION_CONSTANTS } from '../constants/auth.constants';

const email = z.email({ message: 'Email inválido' }).toLowerCase().trim();

const password = z
  .string()
  .min(
    VALIDATION_CONSTANTS.PASSWORD_MIN_LENGTH,
    `Senha deve ter pelo menos ${String(VALIDATION_CONSTANTS.PASSWORD_MIN_LENGTH)} caracteres`
  )
  .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter número')
  .regex(/[^a-zA-Z0-9]/, 'Senha deve conter caractere especial');

const username = z
  .string()
  .min(
    VALIDATION_CONSTANTS.USERNAME_MIN_LENGTH,
    `Username deve ter pelo menos ${String(VALIDATION_CONSTANTS.USERNAME_MIN_LENGTH)} caracteres`
  )
  .max(
    VALIDATION_CONSTANTS.USERNAME_MAX_LENGTH,
    `Username deve ter no máximo ${String(VALIDATION_CONSTANTS.USERNAME_MAX_LENGTH)} caracteres`
  )
  .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e _')
  .toLowerCase()
  .trim();

export const registerSchema = z.object({
  username,
  email,
  password,
  displayName: z
    .string()
    .min(VALIDATION_CONSTANTS.DISPLAY_NAME_MIN_LENGTH)
    .max(VALIDATION_CONSTANTS.DISPLAY_NAME_MAX_LENGTH)
    .trim()
    .optional(),
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
