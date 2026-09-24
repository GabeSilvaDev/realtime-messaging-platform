import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { conversationController } from '../controllers/ConversationController';
import { messageController } from '../controllers/MessageController';

const router = Router();

/**
 * @route POST /conversations/direct
 * @description Cria (ou retorna a existente) conversa 1:1 — 201 nova / 200 existente
 * @access Private
 */
router.post(
  '/direct',
  authenticate,
  asyncHandler((req, res) => conversationController.createDirect(req, res))
);

/**
 * @route POST /conversations/group
 * @description Cria um grupo (criador vira admin)
 * @access Private
 */
router.post(
  '/group',
  authenticate,
  asyncHandler((req, res) => conversationController.createGroup(req, res))
);

/**
 * @route GET /conversations
 * @description Lista conversas do usuário (archived, limit, offset)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => conversationController.list(req, res))
);

/**
 * @route GET /conversations/:id
 * @description Detalhe de uma conversa (404 para não participante)
 * @access Private
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler((req, res) => conversationController.get(req, res))
);

/**
 * @route PATCH /conversations/:id
 * @description Renomeia um grupo (apenas admin)
 * @access Private
 */
router.patch(
  '/:id',
  authenticate,
  asyncHandler((req, res) => conversationController.rename(req, res))
);

/**
 * @route POST /conversations/:id/archive
 * @description Arquiva a conversa para o usuário
 * @access Private
 */
router.post(
  '/:id/archive',
  authenticate,
  asyncHandler((req, res) => conversationController.archive(req, res))
);

/**
 * @route DELETE /conversations/:id/archive
 * @description Desarquiva a conversa para o usuário
 * @access Private
 */
router.delete(
  '/:id/archive',
  authenticate,
  asyncHandler((req, res) => conversationController.unarchive(req, res))
);

/**
 * @route POST /conversations/:id/leave
 * @description Sai de um grupo
 * @access Private
 */
router.post(
  '/:id/leave',
  authenticate,
  asyncHandler((req, res) => conversationController.leave(req, res))
);

/**
 * @route POST /conversations/:id/members
 * @description Adiciona membros a um grupo (apenas admin)
 * @access Private
 */
router.post(
  '/:id/members',
  authenticate,
  asyncHandler((req, res) => conversationController.addMembers(req, res))
);

/**
 * @route DELETE /conversations/:id/members/:userId
 * @description Remove um membro do grupo (apenas admin; a si mesmo = sair)
 * @access Private
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  asyncHandler((req, res) => conversationController.removeMember(req, res))
);

/**
 * @route GET /conversations/:id/messages
 * @description Lista mensagens (mais recentes primeiro; cursor `before`)
 * @access Private
 */
router.get(
  '/:id/messages',
  authenticate,
  asyncHandler((req, res) => messageController.list(req, res))
);

/**
 * @route POST /conversations/:id/messages
 * @description Envia mensagem de texto
 * @access Private
 */
router.post(
  '/:id/messages',
  authenticate,
  asyncHandler((req, res) => messageController.send(req, res))
);

/**
 * @route DELETE /conversations/:id/messages/:messageId
 * @description Apaga (soft delete) mensagem própria
 * @access Private
 */
router.delete(
  '/:id/messages/:messageId',
  authenticate,
  asyncHandler((req, res) => messageController.delete(req, res))
);

/**
 * @route POST /conversations/:id/read
 * @description Marca como lidas as mensagens até `messageId` (inclusive) — 204
 * @access Private
 */
router.post(
  '/:id/read',
  authenticate,
  asyncHandler((req, res) => messageController.markRead(req, res))
);

export { router as conversationRoutes };
