import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { presenceController } from '../controllers/PresenceController';

const router = Router();

/**
 * @route GET /presence?userIds=<uuid>,<uuid>
 * @description Estado de presença de até 100 usuários (pares bloqueados sempre offline)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => presenceController.getStates(req, res))
);

/**
 * @route PUT /presence/status
 * @description Define o status manual (available, away ou busy)
 * @access Private
 */
router.put(
  '/status',
  authenticate,
  asyncHandler((req, res) => presenceController.setStatus(req, res))
);

export { router as presenceRoutes };
