import { z } from 'zod';

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username deve ter no mínimo 3 caracteres')
    .max(50, 'Username deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscores')
    .transform((val) => val.toLowerCase()),
  email: z
    .email('Email inválido')
    .max(255, 'Email deve ter no máximo 255 caracteres')
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .max(100, 'Senha deve ter no máximo 100 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Senha deve conter pelo menos um caractere especial'),
  displayName: z
    .string()
    .min(2, 'Nome de exibição deve ter no mínimo 2 caracteres')
    .max(100, 'Nome de exibição deve ter no máximo 100 caracteres')
    .optional(),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username deve ter no mínimo 3 caracteres')
    .max(50, 'Username deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscores')
    .transform((val) => val.toLowerCase())
    .optional(),
  displayName: z
    .string()
    .min(2, 'Nome de exibição deve ter no mínimo 2 caracteres')
    .max(100, 'Nome de exibição deve ter no máximo 100 caracteres')
    .nullable()
    .optional(),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Nome de exibição deve ter no mínimo 2 caracteres')
    .max(100, 'Nome de exibição deve ter no máximo 100 caracteres')
    .nullable()
    .optional(),
  avatarUrl: z
    .url('URL do avatar inválida')
    .max(500, 'URL do avatar deve ter no máximo 500 caracteres')
    .nullable()
    .optional(),
  bio: z.string().max(500, 'Bio deve ter no máximo 500 caracteres').nullable().optional(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z
    .url('URL do avatar inválida')
    .max(500, 'URL do avatar deve ter no máximo 500 caracteres')
    .nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'away', 'busy'], {
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
    .max(100, 'Termo de busca deve ter no máximo 100 caracteres')
    .optional(),
  status: z.enum(['online', 'offline', 'away', 'busy']).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  orderBy: z
    .enum(['username', 'displayName', 'createdAt', 'lastSeenAt'])
    .optional()
    .default('username'),
  order: z.enum(['ASC', 'DESC']).optional().default('ASC'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
