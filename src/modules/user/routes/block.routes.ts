import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { blockController } from '../controllers/BlockController';

const router = Router();

/**
 * @route GET /blocks
 * @description Lista usuários bloqueados pelo usuário autenticado
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => blockController.list(req, res))
);

/**
 * @route POST /blocks
 * @description Bloqueia um usuário
 * @access Private
 */
router.post(
  '/',
  authenticate,
  asyncHandler((req, res) => blockController.block(req, res))
);

/**
 * @route DELETE /blocks/:userId
 * @description Desbloqueia um usuário
 * @access Private
 */
router.delete(
  '/:userId',
  authenticate,
  asyncHandler((req, res) => blockController.unblock(req, res))
);

export { router as blockRoutes };
