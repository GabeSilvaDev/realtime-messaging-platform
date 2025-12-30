import app from './app';
import { bootstrap } from './bootstrap';

const PORT = process.env.PORT ?? 3000;

async function startServer(): Promise<void> {
  try {
    await bootstrap();

    app.listen(PORT);
  } catch {
    process.exit(1);
  }
}

void startServer();
