import type { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '@/shared/errors';
import { UserStatus } from '@/shared/types';
import { handleMulterError } from '@/shared/middlewares';
import { ProfileService } from '../services/ProfileService';
import type { IProfileService } from '../interfaces';
import type { AvatarFile, ProfileSettings } from '../types/profile.types';
import type { AuthenticatedRequest, MulterFile } from '../types/controller.types';
import {
  updateProfileSchema,
  updateDisplayNameSchema,
  updateBioSchema,
  avatarCropOptionsSchema,
  updateStatusSchema,
  updateProfileSettingsSchema,
  type AvatarCropOptionsInput,
} from '../validation/profile.schemas';

export { type AuthenticatedRequest } from '../types/controller.types';

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

    const profile = await this.profileService.updateProfile(userId, parseResult.data);

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

    const { displayName } = parseResult.data;
    const profile = await this.profileService.updateDisplayName(userId, displayName);

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

    const { bio } = parseResult.data;
    const profile = await this.profileService.updateBio(userId, bio);

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

      let options: AvatarCropOptionsInput | undefined;
      const bodyData = req.body as Record<string, unknown>;
      const rawOptions: unknown = bodyData.options;

      if (rawOptions !== undefined) {
        const optionsToParse: unknown =
          typeof rawOptions === 'string' ? (JSON.parse(rawOptions) as unknown) : rawOptions;
        const parseResult = avatarCropOptionsSchema.safeParse(optionsToParse);
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

      const result = await this.profileService.uploadAvatar(userId, avatarFile, options ?? {});

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

    const { status: statusValue } = parseResult.data;

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

    const settings = await this.profileService.updateProfileSettings(
      userId,
      parseResult.data as Partial<ProfileSettings>
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
