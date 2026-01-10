import { z } from 'zod';
import { uploadConfig } from '@/shared/config/upload';

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

export const updateDisplayNameSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Nome de exibição deve ter no mínimo 2 caracteres')
    .max(100, 'Nome de exibição deve ter no máximo 100 caracteres')
    .nullable(),
});

export const updateBioSchema = z.object({
  bio: z.string().max(500, 'Bio deve ter no máximo 500 caracteres').nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'away', 'busy'], {
    message: 'Status inválido. Use: online, offline, away ou busy',
  }),
});

const maxAvatarSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));

export const avatarFileSchema = z.object({
  fieldname: z.string(),
  originalname: z.string().min(1, 'Nome do arquivo é obrigatório'),
  encoding: z.string(),
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const, {
    message: 'Tipo de imagem não suportado. Use: JPEG, PNG, WebP ou GIF',
  }),
  buffer: z.instanceof(Buffer),
  size: z
    .number()
    .max(
      uploadConfig.limits.maxAvatarSize,
      `Tamanho máximo do avatar: ${String(maxAvatarSizeMB)}MB`
    ),
});

export const uploadAvatarSchema = z.object({
  file: avatarFileSchema,
  options: z
    .object({
      quality: z.number().min(1).max(100).optional(),
      format: z.enum(['webp', 'jpeg', 'png']).optional(),
      generateAllSizes: z.boolean().optional(),
    })
    .optional(),
});

export const avatarProcessingOptionsSchema = z.object({
  quality: z
    .number()
    .min(1, 'Qualidade deve ser no mínimo 1')
    .max(100, 'Qualidade deve ser no máximo 100')
    .optional()
    .default(uploadConfig.avatar.quality),
  format: z
    .enum(['webp', 'jpeg', 'png'], { message: 'Formato inválido. Use: webp, jpeg ou png' })
    .optional()
    .default(uploadConfig.avatar.format),
  generateAllSizes: z.boolean().optional().default(true),
});

export const profileVisibilitySchema = z.object({
  showEmail: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  showStatus: z.boolean().optional(),
  showBio: z.boolean().optional(),
});

export const notificationSettingsSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sound: z.boolean().optional(),
});

export const updateProfileSettingsSchema = z.object({
  visibility: profileVisibilitySchema.optional(),
  notifications: notificationSettingsSchema.optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z
    .string()
    .min(2, 'Código de idioma inválido')
    .max(10, 'Código de idioma inválido')
    .optional(),
});

export const updatePresenceSchema = z.object({
  status: z.enum(['online', 'offline', 'away', 'busy'], {
    message: 'Status inválido',
  }),
});

export const bulkPresenceQuerySchema = z.object({
  userIds: z
    .string()
    .transform((val) => val.split(',').map((id) => id.trim()))
    .pipe(
      z
        .array(z.uuid({ message: 'ID de usuário inválido' }))
        .min(1, 'Pelo menos um ID é obrigatório')
        .max(100, 'Máximo de 100 usuários por consulta')
    ),
});

export const profileIdParamSchema = z.object({
  userId: z.uuid({ message: 'ID de usuário inválido' }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;
export type UpdateBioInput = z.infer<typeof updateBioSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AvatarFileInput = z.infer<typeof avatarFileSchema>;
export type UploadAvatarInput = z.infer<typeof uploadAvatarSchema>;
export type AvatarProcessingOptionsInput = z.infer<typeof avatarProcessingOptionsSchema>;
export type ProfileVisibilityInput = z.infer<typeof profileVisibilitySchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
export type UpdateProfileSettingsInput = z.infer<typeof updateProfileSettingsSchema>;
export type UpdatePresenceInput = z.infer<typeof updatePresenceSchema>;
export type BulkPresenceQuery = z.infer<typeof bulkPresenceQuerySchema>;
export type ProfileIdParam = z.infer<typeof profileIdParamSchema>;
