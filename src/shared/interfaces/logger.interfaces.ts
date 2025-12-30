import { LogLevel, LogCategory } from '../types/logger.types';

export interface LogMetadata {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: Date;
  metadata?: LogMetadata;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  context?: string;
  service: string;
  environment: string;
}

export interface ILogger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, error?: Error, metadata?: LogMetadata): void;
  fatal(message: string, error?: Error, metadata?: LogMetadata): void;
  child(context: string): ILogger;
  setCategory(category: LogCategory): void;
}

export interface LoggerOptions {
  service: string;
  environment: string;
  category?: LogCategory;
  context?: string;
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enableMongo?: boolean;
}

export interface ILogDocument extends Omit<LogEntry, '_id'> {
  createdAt: Date;
  expiresAt: Date;
}
