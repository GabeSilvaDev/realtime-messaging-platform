import { LogLevel } from '../types/logger.types';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

export const LOG_RETENTION_DAYS: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 1,
  [LogLevel.INFO]: 7,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 90,
  [LogLevel.FATAL]: 365,
};

export const LOG_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m',
  [LogLevel.INFO]: '\x1b[32m',
  [LogLevel.WARN]: '\x1b[33m',
  [LogLevel.ERROR]: '\x1b[31m',
  [LogLevel.FATAL]: '\x1b[35m',
};

export const RESET_COLOR = '\x1b[0m';

export const LOG_FLUSH_INTERVAL_MS = 5000;
