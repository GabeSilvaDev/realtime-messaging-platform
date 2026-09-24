import { Router, type RequestHandler } from 'express';
import type { Store } from 'express-rate-limit';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { createRateLimiter } from '@/shared/middlewares/rateLimiter';
import { SEARCH_CONSTANTS } from '../constants';
import { searchController, type SearchController } from '../controllers/SearchController';

/** Rate limit próprio da busca: 30 requisições por minuto por IP (chave padrão do projeto). */
export function createSearchRateLimiter(store?: Store): RequestHandler {
  // Prioriza disponibilidade sobre o rate limiting em si — se o store falhar (ex.: Redis fora
  // do ar), deixa a requisição passar em vez de derrubar a busca.
  return createRateLimiter({
    windowMs: SEARCH_CONSTANTS.RATE_LIMIT_WINDOW_MS,
    max: SEARCH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
    keyPrefix: SEARCH_CONSTANTS.RATE_LIMIT_KEY_PREFIX,
    message: 'Too many search requests, please try again later',
    passOnStoreError: true,
    ...(store !== undefined && { store }),
  });
}

/** Rotas da busca; os parâmetros existem para os testes (limiter novo = contagem zerada). */
export function createSearchRoutes(
  controller: Pick<SearchController, 'searchMessages'> = searchController,
  limiter: RequestHandler = createSearchRateLimiter()
): Router {
  const router = Router();

  /**
   * @route GET /search/messages?q=&conversationId=&senderId=&from=&to=&limit=
   * @description Busca full-text nas mensagens das conversas do usuário (até 100 resultados)
   * @access Private
   */
  router.get(
    '/messages',
    authenticate,
    limiter,
    asyncHandler((req, res) => controller.searchMessages(req, res))
  );

  return router;
}

export const searchRoutes = createSearchRoutes();
