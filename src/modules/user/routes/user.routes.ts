import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { userController } from '../controllers/UserController';

const router = Router();

/**
 * @route GET /users/search
 * @description Busca usuários por username/email/nome (exclui o próprio e bloqueados)
 * @access Private
 */
router.get(
  '/search',
  authenticate,
  asyncHandler((req, res) => userController.search(req, res))
);

export { router as userRoutes };
