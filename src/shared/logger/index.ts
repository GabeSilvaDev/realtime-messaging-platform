export {
  Logger,
  initLogger,
  getLogger,
  isLoggerInitialized,
  LogLevel,
  LogCategory,
} from './Logger';
export type { ILogger, LogEntry, LogMetadata, LoggerOptions } from './Logger';
export { LogModel } from './models/Log.model';

import { getLogger, isLoggerInitialized, initLogger, LogLevel, LogCategory } from './Logger';

const createLazyLogger = (): ReturnType<typeof getLogger> => {
  return new Proxy({} as ReturnType<typeof getLogger>, {
    get(_target, prop): unknown {
      if (!isLoggerInitialized()) {
        initLogger({
          service: 'rtm-platform',
          environment: process.env.NODE_ENV ?? 'development',
          minLevel: LogLevel.DEBUG,
          category: LogCategory.SYSTEM,
          enableConsole: true,
          enableMongo: false,
        });
      }
      const realLogger = getLogger();
      const value = realLogger[prop as keyof typeof realLogger];
      if (typeof value === 'function') {
        return value.bind(realLogger);
      }
      return value;
    },
  });
};

export const logger = createLazyLogger();
