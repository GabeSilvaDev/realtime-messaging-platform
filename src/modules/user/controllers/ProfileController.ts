import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HttpStatus } from '@/shared/errors';
import { UserStatus } from '@/shared/types';
import { handleMulterError } from '@/shared/middlewares';
import { ProfileService, type IProfileService } from '../services/ProfileService';
import type { AvatarFile, ProfileSettings } from '../types/profile.types';

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateDisplayNameSchema = z.object({
  displayName: z.string().min(2).max(50),
});

const updateBioSchema = z.object({
  bio: z.string().max(500),
});

const avatarProcessingOptionsSchema = z.object({
  cropX: z.number().int().min(0).optional(),
  cropY: z.number().int().min(0).optional(),
  cropWidth: z.number().int().min(1).optional(),
  cropHeight: z.number().int().min(1).optional(),
  rotate: z.number().int().min(-360).max(360).optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'away', 'busy']),
});

const updateProfileSettingsSchema = z.object({
  showEmail: z.boolean().optional(),
  showStatus: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  allowMessages: z.enum(['everyone', 'contacts', 'none']).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;
type UpdateBioInput = z.infer<typeof updateBioSchema>;
type AvatarProcessingOptionsInput = z.infer<typeof avatarProcessingOptionsSchema>;
type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
type UpdateProfileSettingsInput = z.infer<typeof updateProfileSettingsSchema>;

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

export type AuthenticatedRequest = Request;

export class ProfileController {
  private readonly profileService: IProfileService;

  constructor(profileService?: IProfileService) {
    this.profileService = profileService ?? new ProfileService();
  }

  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const profile = await this.profileService.getProfile(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: profile,
    });
  }

  async getPublicProfile(req: Request, res: Response): Promise<void> {
    const userId: string | undefined = req.params.userId;

    if (userId === undefined || userId === '') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
      return;
    }

    const profile = await this.profileService.getPublicProfile(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: profile,
    });
  }

  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const parseResult = updateProfileSchema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Dados inválidos',
        errors: issues,
      });
      return;
    }

    const data: UpdateProfileInput = parseResult.data;
    const profile = await this.profileService.updateProfile(userId, data);

    res.status(HttpStatus.OK).json({
      success: true,
      data: profile,
      message: 'Perfil atualizado com sucesso',
    });
  }

  async updateDisplayName(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const parseResult = updateDisplayNameSchema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Dados inválidos',
        errors: issues,
      });
      return;
    }

    const validated: UpdateDisplayNameInput = parseResult.data;
    const profile = await this.profileService.updateDisplayName(userId, validated.displayName);

    res.status(HttpStatus.OK).json({
      success: true,
      data: profile,
      message: 'Nome de exibição atualizado com sucesso',
    });
  }

  async updateBio(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const parseResult = updateBioSchema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Dados inválidos',
        errors: issues,
      });
      return;
    }

    const validated: UpdateBioInput = parseResult.data;
    const profile = await this.profileService.updateBio(userId, validated.bio);

    res.status(HttpStatus.OK).json({
      success: true,
      data: profile,
      message: 'Bio atualizada com sucesso',
    });
  }

  async uploadAvatar(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const file = req.file as MulterFile | undefined;

      if (file === undefined) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Nenhum arquivo enviado',
        });
        return;
      }

      let options: AvatarProcessingOptionsInput = {};
      const bodyData = req.body as Record<string, unknown>;
      const rawOptions: unknown = bodyData.options;

      if (rawOptions !== undefined) {
        const optionsToParse: unknown =
          typeof rawOptions === 'string' ? (JSON.parse(rawOptions) as unknown) : rawOptions;
        const parseResult = avatarProcessingOptionsSchema.safeParse(optionsToParse);
        if (parseResult.success) {
          options = parseResult.data;
        }
      }

      const avatarFile: AvatarFile = {
        fieldname: file.fieldname,
        originalname: file.originalname,
        encoding: file.encoding,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      };

      const result = await this.profileService.uploadAvatar(userId, avatarFile, options);

      res.status(HttpStatus.OK).json({
        success: true,
        data: result,
        message: 'Avatar atualizado com sucesso',
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'MulterError') {
        const appError = handleMulterError(error, 5);
        next(appError);
        return;
      }
      next(error);
    }
  }

  async removeAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const result = await this.profileService.removeAvatar(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
      message: result.deleted ? 'Avatar removido com sucesso' : 'Nenhum avatar para remover',
    });
  }

  async updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const parseResult = updateStatusSchema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Status inválido',
        errors: issues,
      });
      return;
    }

    const validated: UpdateStatusInput = parseResult.data;
    const statusValue = validated.status;

    let userStatus: UserStatus;
    switch (statusValue) {
      case 'online':
        userStatus = UserStatus.ONLINE;
        break;
      case 'offline':
        userStatus = UserStatus.OFFLINE;
        break;
      case 'away':
        userStatus = UserStatus.AWAY;
        break;
      case 'busy':
        userStatus = UserStatus.BUSY;
        break;
    }

    await this.profileService.updateStatus(userId, userStatus);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Status atualizado com sucesso',
    });
  }

  async setOnline(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    await this.profileService.setOnline(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Status atualizado para online',
    });
  }

  async setOffline(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    await this.profileService.setOffline(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Status atualizado para offline',
    });
  }

  async getProfileStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const stats = await this.profileService.getProfileStats(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: stats,
    });
  }

  async getProfileSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const settings = await this.profileService.getProfileSettings(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: settings,
    });
  }

  async updateProfileSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = this.getUserId(req);
    const parseResult = updateProfileSettingsSchema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Configurações inválidas',
        errors: issues,
      });
      return;
    }

    const data: UpdateProfileSettingsInput = parseResult.data;
    const settings = await this.profileService.updateProfileSettings(
      userId,
      data as Partial<ProfileSettings>
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: settings,
      message: 'Configurações atualizadas com sucesso',
    });
  }

  private getUserId(req: AuthenticatedRequest): string {
    const user = req.user as { id: string } | undefined;
    if (user?.id === undefined || user.id === '') {
      throw new Error('Usuário não autenticado');
    }
    return user.id;
  }
}

export const profileController = new ProfileController();
