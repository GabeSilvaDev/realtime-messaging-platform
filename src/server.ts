import { createServer } from 'http';
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createRealtimeServer } from './modules/realtime';
import { logger } from './shared/logger';

const PORT = process.env.PORT ?? 3000;

async function startServer(): Promise<void> {
  try {
    await bootstrap();

    // Socket.IO compartilha o servidor HTTP (e a porta) da API Express.
    const httpServer = createServer(app);
    const realtime = createRealtimeServer(httpServer);
    httpServer.listen(PORT);

    const stop = (signal: NodeJS.Signals): void => {
      logger.info(`${signal} recebido: encerrando o servidor`);
      realtime
        .close()
        .then(shutdown)
        .then(
          () => process.exit(0),
          () => process.exit(1)
        );
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  } catch {
    process.exit(1);
  }
}

void startServer();
