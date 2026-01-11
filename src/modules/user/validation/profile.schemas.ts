import { z } from 'zod';
import { uploadConfig } from '@/shared/config/upload';
import { PROFILE_CONSTANTS, AVATAR_CONSTANTS, STATUS_VALUES, THEME_VALUES } from '../constants';

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(
      PROFILE_CONSTANTS.MIN_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no mínimo ${String(PROFILE_CONSTANTS.MIN_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .max(
      PROFILE_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no máximo ${String(PROFILE_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
  avatarUrl: z
    .url('URL do avatar inválida')
    .max(
      PROFILE_CONSTANTS.MAX_AVATAR_URL_LENGTH,
      `URL do avatar deve ter no máximo ${String(PROFILE_CONSTANTS.MAX_AVATAR_URL_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
  bio: z
    .string()
    .max(
      PROFILE_CONSTANTS.MAX_BIO_LENGTH,
      `Bio deve ter no máximo ${String(PROFILE_CONSTANTS.MAX_BIO_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
});

export const updateDisplayNameSchema = z.object({
  displayName: z
    .string()
    .min(
      PROFILE_CONSTANTS.MIN_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no mínimo ${String(PROFILE_CONSTANTS.MIN_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .max(
      PROFILE_CONSTANTS.MAX_DISPLAY_NAME_LENGTH,
      `Nome de exibição deve ter no máximo ${String(PROFILE_CONSTANTS.MAX_DISPLAY_NAME_LENGTH)} caracteres`
    )
    .nullable(),
});

export const updateBioSchema = z.object({
  bio: z
    .string()
    .max(
      PROFILE_CONSTANTS.MAX_BIO_LENGTH,
      `Bio deve ter no máximo ${String(PROFILE_CONSTANTS.MAX_BIO_LENGTH)} caracteres`
    )
    .nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(STATUS_VALUES, {
    message: 'Status inválido. Use: online, offline, away ou busy',
  }),
});

const maxAvatarSizeMB = Math.round(uploadConfig.limits.maxAvatarSize / (1024 * 1024));

export const avatarFileSchema = z.object({
  fieldname: z.string(),
  originalname: z.string().min(1, 'Nome do arquivo é obrigatório'),
  encoding: z.string(),
  mimetype: z.enum(AVATAR_CONSTANTS.ALLOWED_MIME_TYPES, {
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
      format: z.enum(AVATAR_CONSTANTS.ALLOWED_FORMATS).optional(),
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
    .enum(AVATAR_CONSTANTS.ALLOWED_FORMATS, { message: 'Formato inválido. Use: webp, jpeg ou png' })
    .optional()
    .default(uploadConfig.avatar.format),
  generateAllSizes: z.boolean().optional().default(true),
});

export const avatarCropOptionsSchema = z.object({
  cropX: z.number().int().min(0).optional(),
  cropY: z.number().int().min(0).optional(),
  cropWidth: z.number().int().min(1).optional(),
  cropHeight: z.number().int().min(1).optional(),
  rotate: z.number().int().min(-360).max(360).optional(),
  quality: z.number().int().min(1).max(100).optional(),
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
  theme: z.enum(THEME_VALUES).optional(),
  language: z
    .string()
    .min(2, 'Código de idioma inválido')
    .max(10, 'Código de idioma inválido')
    .optional(),
});

export const updatePresenceSchema = z.object({
  status: z.enum(STATUS_VALUES, {
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
export type AvatarCropOptionsInput = z.infer<typeof avatarCropOptionsSchema>;
export type ProfileVisibilityInput = z.infer<typeof profileVisibilitySchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
export type UpdateProfileSettingsInput = z.infer<typeof updateProfileSettingsSchema>;
export type UpdatePresenceInput = z.infer<typeof updatePresenceSchema>;
export type BulkPresenceQuery = z.infer<typeof bulkPresenceQuerySchema>;
export type ProfileIdParam = z.infer<typeof profileIdParamSchema>;
