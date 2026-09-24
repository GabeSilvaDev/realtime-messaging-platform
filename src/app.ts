import path from 'path';
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
import { presenceRoutes } from './modules/presence/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

/** Cliente demo estático (HTML + JS puro); resolvido a partir da raiz do projeto (cwd). */
const DEMO_DIR = path.resolve(process.cwd(), 'public', 'demo');

/**
 * O cliente demo é servido fora de produção; em produção só com `DEMO_ENABLED=true` (opt-in
 * explícito — é uma página de demonstração, não um frontend de produção).
 */
export function isDemoEnabled(
  environment: Record<string, string | undefined> = process.env
): boolean {
  return environment.NODE_ENV !== 'production' || environment.DEMO_ENABLED === 'true';
}

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

if (isDemoEnabled()) {
  app.use('/demo', express.static(DEMO_DIR));
}

app.use('/api', getRateLimiter());

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/presence', presenceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
