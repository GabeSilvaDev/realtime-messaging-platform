import express, { Application } from 'express';
import { initLogger, LogLevel, LogCategory } from './shared/logger';
import {
  createCorsMiddleware,
  createHelmetMiddleware,
  createRequestIdMiddleware,
  requestLogger,
  notFoundHandler,
  errorHandler,
  getRateLimiter,
} from './shared/middlewares';
import type { Environment } from './shared/types';
import { authRoutes } from './modules/auth/routes';
import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './modules/user/routes';
import { conversationRoutes } from './modules/chat/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

/**
 * Interpreta a variável de ambiente TRUST_PROXY para `app.set('trust proxy', …)`.
 * - não definida / vazia → `undefined` (não altera o padrão do Express)
 * - "true" / "false" → boolean
 * - um número (ex.: "1", "2") → quantidade de hops de proxy confiáveis
 * - qualquer outra string (ex.: "loopback", "linklocal", um IP/CIDR) → repassada como está,
 *   interpretada pelo Express/proxy-addr
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

initLogger({
  service: 'real-time-messaging-platform',
  environment: env,
  minLevel: env === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableMongo: false,
  category: LogCategory.SYSTEM,
});

const app: Application = express();

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) {
  app.set('trust proxy', trustProxy);
}

app.use(createHelmetMiddleware());
app.use(createCorsMiddleware());

app.use(createRequestIdMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

app.use('/api', getRateLimiter());

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
