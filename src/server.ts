import { createServer } from 'http';
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createRealtimeServer, type TrustProxyFn } from './modules/realtime';
import {
  createServerErrorHandler,
  createStopHandler,
  registerProcessErrorHandlers,
} from './serverLifecycle';
import { logger } from './shared/logger';

const PORT = process.env.PORT ?? 3000;

async function startServer(): Promise<void> {
  try {
    await bootstrap();

    // Socket.IO compartilha o servidor HTTP (e a porta) da API Express.
    const httpServer = createServer(app);
    // Mesmo `trust proxy` do Express: o IP do socket segue a regra do `req.ip`.
    const realtime = createRealtimeServer(httpServer, {
      trustProxy: app.get('trust proxy fn') as TrustProxyFn,
    });

    const stop = createStopHandler({
      realtime,
      shutdown,
      exit: (code: number): void => {
        process.exit(code);
      },
      logger,
    });
    // Wrappers explícitos: o Node passa o número do sinal como 2º argumento do listener.
    process.once('SIGTERM', () => {
      stop('SIGTERM');
    });
    process.once('SIGINT', () => {
      stop('SIGINT');
    });
    registerProcessErrorHandlers({ proc: process, logger, stop });
    // Registrado antes do listen: um EADDRINUSE é logado e encerra com código 1.
    httpServer.on('error', createServerErrorHandler({ logger, stop }));

    httpServer.listen(PORT);
  } catch (error) {
    logger.error(
      'Falha ao iniciar o servidor',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(1);
  }
}

void startServer();
