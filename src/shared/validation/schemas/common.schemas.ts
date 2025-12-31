import { z } from 'zod';

export const uuidSchema = z.uuid({ message: 'UUID inválido' });

export const emailSchema = z
  .string()
  .check(z.email({ message: 'Email inválido' }))
  .min(5, { message: 'Email deve ter pelo menos 5 caracteres' })
  .max(255, { message: 'Email deve ter no máximo 255 caracteres' })
  .toLowerCase()
  .trim();

export const usernameSchema = z
  .string()
  .min(3, { message: 'Username deve ter pelo menos 3 caracteres' })
  .max(30, { message: 'Username deve ter no máximo 30 caracteres' })
  .regex(/^[a-zA-Z0-9_]+$/, {
    message: 'Username deve conter apenas letras, números e underscores',
  })
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, { message: 'Senha deve ter pelo menos 8 caracteres' })
  .max(128, { message: 'Senha deve ter no máximo 128 caracteres' })
  .regex(/[a-z]/, { message: 'Senha deve conter pelo menos uma letra minúscula' })
  .regex(/[A-Z]/, { message: 'Senha deve conter pelo menos uma letra maiúscula' })
  .regex(/[0-9]/, { message: 'Senha deve conter pelo menos um número' })
  .regex(/[^a-zA-Z0-9]/, { message: 'Senha deve conter pelo menos um caractere especial' });

export const displayNameSchema = z
  .string()
  .min(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  .max(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  .trim();

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, { message: 'Telefone inválido (formato E.164)' })
  .optional();

export const urlSchema = z
  .string()
  .check(z.url({ message: 'URL inválida' }))
  .max(2048, {
    message: 'URL deve ter no máximo 2048 caracteres',
  });

export const dateSchema = z.coerce.date({ message: 'Data inválida' });

export const dateStringSchema = z.iso.datetime({ message: 'Data deve estar no formato ISO 8601' });

export const timestampSchema = z
  .number()
  .int()
  .positive({ message: 'Timestamp deve ser um número positivo' });

export const booleanStringSchema = z
  .enum(['true', 'false', '1', '0'])
  .transform((val) => val === 'true' || val === '1');

export const positiveIntSchema = z
  .number()
  .int({ message: 'Deve ser um número inteiro' })
  .positive({ message: 'Deve ser um número positivo' });

export const nonNegativeIntSchema = z
  .number()
  .int({ message: 'Deve ser um número inteiro' })
  .nonnegative({ message: 'Deve ser um número não negativo' });

export const messageContentSchema = z
  .string()
  .min(1, { message: 'Mensagem não pode estar vazia' })
  .max(4000, { message: 'Mensagem deve ter no máximo 4000 caracteres' })
  .trim();

export const chatNameSchema = z
  .string()
  .min(1, { message: 'Nome do chat não pode estar vazio' })
  .max(100, { message: 'Nome do chat deve ter no máximo 100 caracteres' })
  .trim();

export const chatDescriptionSchema = z
  .string()
  .max(500, { message: 'Descrição deve ter no máximo 500 caracteres' })
  .trim()
  .optional();

export const messageTypeSchema = z.enum(['text', 'image', 'video', 'audio', 'file', 'system'], {
  message: 'Tipo de mensagem inválido',
});

export const userStatusSchema = z.enum(['online', 'offline', 'away', 'busy', 'invisible'], {
  message: 'Status inválido',
});

export const chatTypeSchema = z.enum(['direct', 'group', 'channel'], {
  message: 'Tipo de chat inválido',
});

export const mediaSchema = z.object({
  url: urlSchema,
  type: z.enum(['image', 'video', 'audio', 'file']),
  filename: z.string().max(255).optional(),
  size: z.number().positive().optional(),
  mimeType: z.string().max(100).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  thumbnail: urlSchema.optional(),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  name: z.string().max(200).optional(),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const slugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});

export const tokenSchema = z.string().min(10, { message: 'Token inválido' });

export const refreshTokenSchema = z.string().min(10, { message: 'Refresh token inválido' });

export const optionalStringSchema = z.string().optional();

export const requiredStringSchema = z.string().min(1, { message: 'Campo obrigatório' });

export const stringArraySchema = z.array(z.string()).min(1, {
  message: 'Deve conter pelo menos um item',
});

export const uuidArraySchema = z.array(uuidSchema).min(1, {
  message: 'Deve conter pelo menos um ID',
});

export type UUID = z.infer<typeof uuidSchema>;
export type Email = z.infer<typeof emailSchema>;
export type Username = z.infer<typeof usernameSchema>;
export type Password = z.infer<typeof passwordSchema>;
export type DisplayName = z.infer<typeof displayNameSchema>;
export type MessageContent = z.infer<typeof messageContentSchema>;
export type MessageType = z.infer<typeof messageTypeSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type ChatType = z.infer<typeof chatTypeSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Location = z.infer<typeof locationSchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
