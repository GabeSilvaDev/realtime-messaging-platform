import { z } from 'zod';
import { USER_CONSTANTS, USER_STATUS, USER_ORDER_BY, SORT_ORDER } from '../constants';

export const createUserSchema = z.object({
  username: z
    .string()
    .min(
      USER_CONSTANTS.MIN_USERNAME_LENGTH,
      `Username deve ter no mínimo ${String(USER_CONSTANTS.MIN_USERNAME_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_USERNAME_LENGTH,
      `Username deve ter no máximo ${String(USER_CONSTANTS.MAX_USERNAME_LENGTH)} caracteres`
    )
    .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscores')
    .transform((val) => val.toLowerCase()),
  email: z
    .email('Email inválido')
    .max(
      USER_CONSTANTS.MAX_EMAIL_LENGTH,
      `Email deve ter no máximo ${String(USER_CONSTANTS.MAX_EMAIL_LENGTH)} caracteres`
    )
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(
      USER_CONSTANTS.MIN_PASSWORD_LENGTH,
      `Senha deve ter no mínimo ${String(USER_CONSTANTS.MIN_PASSWORD_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_PASSWORD_LENGTH,
      `Senha deve ter no máximo ${String(USER_CONSTANTS.MAX_PASSWORD_LENGTH)} caracteres`
    )
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Senha deve conter pelo menos um caractere especial'),
  displayName: z
    .string()
    .min(
      USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no mínimo ${String(USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no máximo ${String(USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .optional(),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(
      USER_CONSTANTS.MIN_USERNAME_LENGTH,
      `Username deve ter no mínimo ${String(USER_CONSTANTS.MIN_USERNAME_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_USERNAME_LENGTH,
      `Username deve ter no máximo ${String(USER_CONSTANTS.MAX_USERNAME_LENGTH)} caracteres`
    )
    .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscores')
    .transform((val) => val.toLowerCase())
    .optional(),
  displayName: z
    .string()
    .min(
      USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no mínimo ${String(USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no máximo ${String(USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(
      USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no mínimo ${String(USER_CONSTANTS.MIN_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .max(
      USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no máximo ${String(USER_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
  avatarUrl: z
    .url('URL do avatar inválida')
    .max(
      USER_CONSTANTS.MAX_AVATAR_URL_LENGTH,
      `URL do avatar deve ter no máximo ${String(USER_CONSTANTS.MAX_AVATAR_URL_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
  bio: z
    .string()
    .max(
      USER_CONSTANTS.MAX_BIO_LENGTH,
      `Bio deve ter no máximo ${String(USER_CONSTANTS.MAX_BIO_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z
    .url('URL do avatar inválida')
    .max(
      USER_CONSTANTS.MAX_AVATAR_URL_LENGTH,
      `URL do avatar deve ter no máximo ${String(USER_CONSTANTS.MAX_AVATAR_URL_LENGTH)} caracteres`
    )
    .nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(USER_STATUS, {
    message: 'Status inválido. Use: online, offline, away ou busy',
  }),
});

export const userIdParamSchema = z.object({
  userId: z.uuid({ message: 'ID de usuário inválido' }),
});

export const searchUsersSchema = z.object({
  query: z
    .string()
    .min(1, 'Termo de busca é obrigatório')
    .max(
      USER_CONSTANTS.MAX_SEARCH_LENGTH,
      `Termo de busca deve ter no máximo ${String(USER_CONSTANTS.MAX_SEARCH_LENGTH)} caracteres`
    )
    .optional(),
  status: z.enum(USER_STATUS).optional(),
  limit: z.coerce
    .number()
    .min(1)
    .max(USER_CONSTANTS.MAX_LIMIT)
    .optional()
    .default(USER_CONSTANTS.DEFAULT_LIMIT),
  offset: z.coerce.number().min(0).optional().default(0),
  orderBy: z.enum(USER_ORDER_BY).optional().default('username'),
  order: z.enum(SORT_ORDER).optional().default('ASC'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
