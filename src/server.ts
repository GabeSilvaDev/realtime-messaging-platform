import { createServer } from 'http';
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createPresenceRealtime, registerPresenceBridge } from './modules/presence';
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
    // Presença: hooks de conexão/desconexão (o realtime não conhece o presence).
    const presence = createPresenceRealtime();
    // Mesmo `trust proxy` do Express: o IP do socket segue a regra do `req.ip`.
    const realtime = createRealtimeServer(httpServer, {
      trustProxy: app.get('trust proxy fn') as TrustProxyFn,
      onConnection: [presence.onConnection],
      onDisconnect: [presence.onDisconnect],
    });
    const unregisterPresenceBridge = registerPresenceBridge(realtime.io);
    presence.start();

    const stop = createStopHandler({
      realtime,
      // Heartbeat/varredura param antes do `io.close()`: as entradas deste nó expiram em 30 s.
      beforeClose: () => {
        presence.stop();
        unregisterPresenceBridge();
      },
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
