import { LogLevel, LogCategory } from '../types/logger.types';
import type {
  ILogger,
  LogEntry,
  LogMetadata,
  LoggerOptions,
} from '../interfaces/logger.interfaces';
import {
  LOG_LEVEL_PRIORITY,
  LOG_RETENTION_DAYS,
  LOG_COLORS,
  RESET_COLOR,
  LOG_FLUSH_INTERVAL_MS,
} from '../constants';
import { LogModel } from './models/Log.model';

export class Logger implements ILogger {
  private static instance: Logger | null = null;
  private options: Required<LoggerOptions>;
  private category: LogCategory;
  private context?: string;
  private writeQueue: LogEntry[] = [];
  private isProcessing = false;
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor(options: LoggerOptions) {
    this.options = {
      service: options.service,
      environment: options.environment,
      category: options.category ?? LogCategory.SYSTEM,
      context: options.context ?? '',
      minLevel: options.minLevel ?? LogLevel.DEBUG,
      enableConsole: options.enableConsole ?? true,
      enableMongo: options.enableMongo ?? true,
    };
    this.category = this.options.category;
    this.context = this.options.context;

    if (this.options.enableMongo) {
      this.startFlushInterval();
    }
  }

  public static getInstance(options?: LoggerOptions): Logger {
    if (Logger.instance === null) {
      if (options === undefined) {
        throw new Error('Logger must be initialized with options on first call');
      }
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  public static resetInstance(): void {
    if (Logger.instance !== null) {
      Logger.instance.stop();
      Logger.instance = null;
    }
  }

  public debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, undefined, metadata);
  }

  public info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, undefined, metadata);
  }

  public warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, undefined, metadata);
  }

  public error(message: string, error?: Error, metadata?: LogMetadata): void {
    this.log(LogLevel.ERROR, message, error, metadata);
  }

  public fatal(message: string, error?: Error, metadata?: LogMetadata): void {
    this.log(LogLevel.FATAL, message, error, metadata);
  }

  public child(context: string): ILogger {
    const parentContext = this.context;
    const childLogger = new Logger({
      ...this.options,
      context:
        parentContext !== undefined && parentContext !== ''
          ? `${parentContext}:${context}`
          : context,
    });
    childLogger.category = this.category;
    return childLogger;
  }

  public setCategory(category: LogCategory): void {
    this.category = category;
  }

  private log(level: LogLevel, message: string, error?: Error, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      category: this.category,
      message,
      timestamp: new Date(),
      metadata,
      context: this.context,
      service: this.options.service,
      environment: this.options.environment,
    };

    if (error !== undefined) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (this.options.enableConsole) {
      this.writeToConsole(entry);
    }

    if (this.options.enableMongo) {
      this.writeQueue.push(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.options.minLevel];
  }

  private writeToConsole(entry: LogEntry): void {
    const color = LOG_COLORS[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const entryContext = entry.context;
    const contextStr = entryContext !== undefined && entryContext !== '' ? `[${entryContext}]` : '';
    const categoryStr = `[${entry.category}]`;

    const baseMessage = `${color}${timestamp} ${levelStr}${RESET_COLOR} ${categoryStr}${contextStr} ${entry.message}`;

    if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
      process.stderr.write(`${baseMessage}\n`);
      if (entry.error?.stack !== undefined) {
        process.stderr.write(`${entry.error.stack}\n`);
      }
    } else if (entry.level === LogLevel.WARN) {
      process.stderr.write(`${baseMessage}\n`);
    } else {
      process.stdout.write(`${baseMessage}\n`);
    }

    if (entry.metadata !== undefined && Object.keys(entry.metadata).length > 0) {
      process.stdout.write(`  Metadata: ${JSON.stringify(entry.metadata, null, 2)}\n`);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, LOG_FLUSH_INTERVAL_MS);
  }

  public async flush(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const entries = [...this.writeQueue];
    this.writeQueue = [];

    try {
      const documents = entries.map((entry) => ({
        ...entry,
        expiresAt: this.calculateExpiryDate(entry.level),
      }));

      await LogModel.insertMany(documents, { ordered: false });
    } catch {
      this.writeQueue.unshift(...entries);
    } finally {
      this.isProcessing = false;
    }
  }

  private calculateExpiryDate(level: LogLevel): Date {
    const days = LOG_RETENTION_DAYS[level];
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    return expiryDate;
  }

  public stop(): void {
    if (this.flushInterval !== null) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    void this.flush();
  }

  public async query(options: {
    level?: LogLevel;
    category?: LogCategory;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    requestId?: string;
    limit?: number;
    skip?: number;
  }): Promise<LogEntry[]> {
    interface QueryFilter {
      level?: LogLevel;
      category?: LogCategory;
      timestamp?: { $gte?: Date; $lte?: Date };
      'metadata.userId'?: string;
      'metadata.requestId'?: string;
    }

    const filter: QueryFilter = {};

    if (options.level !== undefined) {
      filter.level = options.level;
    }

    if (options.category !== undefined) {
      filter.category = options.category;
    }

    if (options.startDate !== undefined || options.endDate !== undefined) {
      filter.timestamp = {};
      if (options.startDate !== undefined) {
        filter.timestamp.$gte = options.startDate;
      }
      if (options.endDate !== undefined) {
        filter.timestamp.$lte = options.endDate;
      }
    }

    if (options.userId !== undefined) {
      filter['metadata.userId'] = options.userId;
    }

    if (options.requestId !== undefined) {
      filter['metadata.requestId'] = options.requestId;
    }

    const results = await LogModel.find(filter)
      .sort({ timestamp: -1 })
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 100)
      .lean()
      .exec();

    return results as LogEntry[];
  }
}

let loggerInstance: Logger | null = null;

export function initLogger(options: LoggerOptions): Logger {
  loggerInstance = Logger.getInstance(options);
  return loggerInstance;
}

export function isLoggerInitialized(): boolean {
  return loggerInstance !== null;
}

export function getLogger(): Logger {
  if (loggerInstance === null) {
    throw new Error('Logger not initialized. Call initLogger() first.');
  }
  return loggerInstance;
}

export { LogLevel, LogCategory } from '../types/logger.types';
export type {
  ILogger,
  LogEntry,
  LogMetadata,
  LoggerOptions,
} from '../interfaces/logger.interfaces';
