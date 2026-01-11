import { Router } from 'express';
import { profileController } from '../controllers';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { uploadAvatar } from '@/shared/middlewares';

const router = Router();

/**
 * @route GET /profile
 * @description Obtém o perfil do usuário autenticado
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => profileController.getProfile(req, res))
);

/**
 * @route PUT /profile
 * @description Atualiza o perfil do usuário autenticado
 * @access Private
 */
router.put(
  '/',
  authenticate,
  asyncHandler((req, res) => profileController.updateProfile(req, res))
);

/**
 * @route PATCH /profile
 * @description Atualiza parcialmente o perfil do usuário
 * @access Private
 */
router.patch(
  '/',
  authenticate,
  asyncHandler((req, res) => profileController.updateProfile(req, res))
);

/**
 * @route PUT /profile/display-name
 * @description Atualiza o nome de exibição
 * @access Private
 */
router.put(
  '/display-name',
  authenticate,
  asyncHandler((req, res) => profileController.updateDisplayName(req, res))
);

/**
 * @route PUT /profile/bio
 * @description Atualiza a bio do usuário
 * @access Private
 */
router.put(
  '/bio',
  authenticate,
  asyncHandler((req, res) => profileController.updateBio(req, res))
);

/**
 * @route POST /profile/avatar
 * @description Faz upload de um novo avatar
 * @access Private
 * @body multipart/form-data - field: avatar
 */
router.post(
  '/avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  asyncHandler((req, res, next) => profileController.uploadAvatar(req, res, next))
);

/**
 * @route DELETE /profile/avatar
 * @description Remove o avatar do usuário
 * @access Private
 */
router.delete(
  '/avatar',
  authenticate,
  asyncHandler((req, res) => profileController.removeAvatar(req, res))
);

/**
 * @route PUT /profile/status
 * @description Atualiza o status de presença
 * @access Private
 */
router.put(
  '/status',
  authenticate,
  asyncHandler((req, res) => profileController.updateStatus(req, res))
);

/**
 * @route POST /profile/online
 * @description Define o status como online
 * @access Private
 */
router.post(
  '/online',
  authenticate,
  asyncHandler((req, res) => profileController.setOnline(req, res))
);

/**
 * @route POST /profile/offline
 * @description Define o status como offline
 * @access Private
 */
router.post(
  '/offline',
  authenticate,
  asyncHandler((req, res) => profileController.setOffline(req, res))
);

/**
 * @route GET /profile/stats
 * @description Obtém estatísticas do perfil
 * @access Private
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler((req, res) => profileController.getProfileStats(req, res))
);

/**
 * @route GET /profile/settings
 * @description Obtém configurações do perfil
 * @access Private
 */
router.get(
  '/settings',
  authenticate,
  asyncHandler((req, res) => profileController.getProfileSettings(req, res))
);

/**
 * @route PUT /profile/settings
 * @description Atualiza configurações do perfil
 * @access Private
 */
router.put(
  '/settings',
  authenticate,
  asyncHandler((req, res) => profileController.updateProfileSettings(req, res))
);

/**
 * @route GET /profile/:userId
 * @description Obtém o perfil público de um usuário
 * @access Private
 * @note Esta rota deve ficar por último para não capturar outras rotas
 */
router.get(
  '/:userId',
  authenticate,
  asyncHandler((req, res) => profileController.getPublicProfile(req, res))
);

export { router as profileRoutes };
