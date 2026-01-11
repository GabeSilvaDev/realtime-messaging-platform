import express, { Application } from 'express';
import { initLogger, LogLevel, LogCategory } from './shared/logger';
import {
  createCorsMiddleware,
  createHelmetMiddleware,
  createRequestIdMiddleware,
  requestLogger,
  notFoundHandler,
  errorHandler,
} from './shared/middlewares';
import type { Environment } from './shared/types';
import { authRoutes } from './modules/auth/routes';
import { profileRoutes } from './modules/user/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

initLogger({
  service: 'real-time-messaging-platform',
  environment: env,
  minLevel: env === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableMongo: false,
  category: LogCategory.SYSTEM,
});

const app: Application = express();

app.use(createHelmetMiddleware());
app.use(createCorsMiddleware());

app.use(createRequestIdMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
