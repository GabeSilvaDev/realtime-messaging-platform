import 'jest-extended';
import { Logger } from '@/shared/logger/Logger';
import { LogLevel, LogCategory } from '@/shared/types/logger.types';

beforeAll(() => {
  process.env.NODE_ENV = 'test';

  Logger.resetInstance();
  Logger.getInstance({
    service: 'test',
    environment: 'test',
    category: LogCategory.SYSTEM,
    minLevel: LogLevel.FATAL,
    enableConsole: false,
    enableMongo: false,
  });
});

afterAll(() => {
  Logger.resetInstance();
});
