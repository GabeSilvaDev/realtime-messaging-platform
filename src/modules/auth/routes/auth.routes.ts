import { Router } from 'express';
import { authController } from '../controllers';
import { authenticate, asyncHandler } from '../middlewares';

const router = Router();

/**
 * @route POST /auth/register
 * @description Registra um novo usuário
 * @access Public
 */
router.post(
  '/register',
  asyncHandler((req, res) => authController.register(req, res))
);

/**
 * @route POST /auth/login
 * @description Realiza login do usuário
 * @access Public
 */
router.post(
  '/login',
  asyncHandler((req, res) => authController.login(req, res))
);

/**
 * @route POST /auth/logout
 * @description Realiza logout (revoga refresh token)
 * @access Public
 */
router.post(
  '/logout',
  asyncHandler((req, res) => authController.logout(req, res))
);

/**
 * @route POST /auth/refresh
 * @description Renova os tokens usando refresh token
 * @access Public
 */
router.post(
  '/refresh',
  asyncHandler((req, res) => authController.refresh(req, res))
);

/**
 * @route POST /auth/forgot-password
 * @description Solicita recuperação de senha
 * @access Public
 */
router.post(
  '/forgot-password',
  asyncHandler((req, res) => authController.forgotPassword(req, res))
);

/**
 * @route POST /auth/reset-password
 * @description Reseta a senha usando token de recuperação
 * @access Public
 */
router.post(
  '/reset-password',
  asyncHandler((req, res) => authController.resetPassword(req, res))
);

/**
 * @route POST /auth/change-password
 * @description Altera a senha do usuário autenticado
 * @access Private
 */
router.post(
  '/change-password',
  authenticate,
  asyncHandler((req, res) => authController.changePassword(req, res))
);

/**
 * @route GET /auth/me
 * @description Retorna dados do usuário autenticado
 * @access Private
 */
router.get(
  '/me',
  authenticate,
  asyncHandler((req, res) => {
    authController.me(req, res);
  })
);

/**
 * @route GET /auth/sessions
 * @description Lista sessões ativas do usuário
 * @access Private
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler((req, res) => authController.getSessions(req, res))
);

/**
 * @route DELETE /auth/sessions
 * @description Revoga todas as sessões (exceto atual se keepCurrent=true)
 * @access Private
 */
router.delete(
  '/sessions',
  authenticate,
  asyncHandler((req, res) => authController.revokeSessions(req, res))
);

export { router as authRoutes };
