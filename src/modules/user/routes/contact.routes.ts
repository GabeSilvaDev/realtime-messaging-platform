import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { contactController } from '../controllers/ContactController';

const router = Router();

/**
 * @route GET /contacts
 * @description Lista contatos do usuário autenticado (paginado, com filtros)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => contactController.list(req, res))
);

/**
 * @route POST /contacts
 * @description Adiciona um contato
 * @access Private
 */
router.post(
  '/',
  authenticate,
  asyncHandler((req, res) => contactController.add(req, res))
);

/**
 * @route GET /contacts/favorites
 * @description Lista contatos favoritos
 * @access Private
 */
router.get(
  '/favorites',
  authenticate,
  asyncHandler((req, res) => contactController.listFavorites(req, res))
);

/**
 * @route GET /contacts/stats
 * @description Retorna estatísticas de contatos
 * @access Private
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler((req, res) => contactController.stats(req, res))
);

/**
 * @route GET /contacts/:contactId
 * @description Obtém um contato
 * @access Private
 */
router.get(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.get(req, res))
);

/**
 * @route PATCH /contacts/:contactId
 * @description Atualiza apelido e/ou favorito de um contato
 * @access Private
 */
router.patch(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.update(req, res))
);

/**
 * @route DELETE /contacts/:contactId
 * @description Remove um contato
 * @access Private
 */
router.delete(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.remove(req, res))
);

export { router as contactRoutes };
