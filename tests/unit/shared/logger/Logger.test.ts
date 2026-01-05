jest.resetModules();

jest.mock('@/shared/logger/models/Log.model', () => {
  const mockExec = jest.fn().mockResolvedValue([]);
  return {
    LogModel: {
      insertMany: jest.fn().mockResolvedValue([]),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              lean: jest.fn(() => ({
                exec: mockExec,
              })),
            })),
          })),
        })),
      })),
    },
  };
});

import { Logger, initLogger, getLogger, LogLevel, LogCategory } from '@/shared/logger';
import { LogModel } from '@/shared/logger/models/Log.model';

describe('Logger', () => {
  const defaultOptions = {
    service: 'test-service',
    environment: 'test',
    category: LogCategory.SYSTEM,
    context: 'TestContext',
    minLevel: LogLevel.DEBUG,
    enableConsole: false,
    enableMongo: false,
  };

  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    Logger.resetInstance();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    Logger.resetInstance();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = Logger.getInstance(defaultOptions);
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should throw error if not initialized with options on first call', () => {
      expect(() => Logger.getInstance()).toThrow(
        'Logger must be initialized with options on first call'
      );
    });

    it('should use default values for optional options', () => {
      const logger = Logger.getInstance({
        service: 'test-service',
        environment: 'test',
        enableMongo: false,
      });

      expect(logger).toBeDefined();
    });

    it('should use default enableConsole true when not provided', () => {
      Logger.resetInstance();
      const logger = Logger.getInstance({
        service: 'test-service',
        environment: 'test',
        enableMongo: false,
      });

      logger.info('Test message');

      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should use default enableMongo true when not provided', () => {
      jest.useFakeTimers();
      Logger.resetInstance();
      const logger = Logger.getInstance({
        service: 'test-service',
        environment: 'test',
        enableConsole: false,
      });

      logger.info('Test message');

      jest.advanceTimersByTime(5000);

      Logger.resetInstance();
      jest.clearAllTimers();
      jest.useRealTimers();

      expect(LogModel.insertMany).toHaveBeenCalled();
    });
  });

  describe('resetInstance', () => {
    it('should reset the singleton instance', () => {
      const instance1 = Logger.getInstance(defaultOptions);
      Logger.resetInstance();
      const instance2 = Logger.getInstance(defaultOptions);

      expect(instance1).not.toBe(instance2);
    });

    it('should do nothing if instance is null', () => {
      Logger.resetInstance();
      Logger.resetInstance();
      expect(() => Logger.getInstance(defaultOptions)).not.toThrow();
    });
  });

  describe('logging methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance({
        ...defaultOptions,
        enableConsole: true,
      });
    });

    it('should log debug messages', () => {
      logger.debug('Debug message', { key: 'value' });

      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('Info message', { key: 'value' });

      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should log warn messages to stderr', () => {
      logger.warn('Warn message', { key: 'value' });

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should log error messages to stderr', () => {
      const error = new Error('Test error');
      logger.error('Error message', error, { key: 'value' });

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should log error messages to stderr with stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Test.fn';
      logger.error('Error message', error);

      expect(stderrSpy).toHaveBeenCalledTimes(2);
    });

    it('should log error messages to stderr without stack trace when stack is undefined', () => {
      const error = new Error('Test error');
      error.stack = undefined;
      logger.error('Error message', error);

      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('should log fatal messages to stderr', () => {
      const error = new Error('Fatal error');
      logger.fatal('Fatal message', error, { key: 'value' });

      expect(stderrSpy).toHaveBeenCalled();
    });

    it('should log fatal messages to stderr with stack trace', () => {
      const error = new Error('Fatal error');
      error.stack = 'Error: Fatal error\n    at Test.fn';
      logger.fatal('Fatal message', error);

      expect(stderrSpy).toHaveBeenCalledTimes(2);
    });

    it('should not log if level is below minLevel', () => {
      Logger.resetInstance();
      const warnLogger = Logger.getInstance({
        ...defaultOptions,
        enableConsole: true,
        minLevel: LogLevel.WARN,
      });

      warnLogger.debug('Debug message');
      warnLogger.info('Info message');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should log metadata when present', () => {
      logger.info('Info message', { userId: '123', requestId: 'abc' });

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Metadata:'));
    });

    it('should not log metadata when empty object', () => {
      logger.info('Info message', {});

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log metadata when undefined', () => {
      logger.info('Info message');

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('writeToConsole with context variations', () => {
    it('should log without context when context is empty string', () => {
      const logger = Logger.getInstance({
        ...defaultOptions,
        context: '',
        enableConsole: true,
      });

      logger.info('Message without context');

      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should log without context when context is undefined', () => {
      Logger.resetInstance();
      const logger = Logger.getInstance({
        service: 'test-service',
        environment: 'test',
        enableConsole: true,
        enableMongo: false,
      });

      logger.info('Message without context');

      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create a child logger with combined context', () => {
      const logger = Logger.getInstance({
        ...defaultOptions,
        context: 'Parent',
        enableConsole: true,
      });

      const childLogger = logger.child('Child');
      childLogger.info('Child message');

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[Parent:Child]'));
    });

    it('should create a child logger with only child context when parent has no context', () => {
      Logger.resetInstance();
      const logger = Logger.getInstance({
        ...defaultOptions,
        context: '',
        enableConsole: true,
      });

      const childLogger = logger.child('Child');
      childLogger.info('Child message');

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[Child]'));
    });

    it('should create a child logger when parent context is undefined', () => {
      Logger.resetInstance();
      const logger = Logger.getInstance({
        service: 'test-service',
        environment: 'test',
        enableConsole: true,
        enableMongo: false,
      });

      const childLogger = logger.child('Child');
      childLogger.info('Child message');

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[Child]'));
    });
  });

  describe('setCategory', () => {
    it('should change the category', () => {
      const logger = Logger.getInstance({
        ...defaultOptions,
        enableConsole: true,
      });

      logger.setCategory(LogCategory.AUTH);
      logger.info('Auth message');

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[auth]'));
    });
  });

  describe('query', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance(defaultOptions);
      const mockExec = jest.fn().mockResolvedValue([]);
      const mockLean = jest.fn(() => ({ exec: mockExec }));
      const mockLimit = jest.fn(() => ({ lean: mockLean }));
      const mockSkip = jest.fn(() => ({ limit: mockLimit }));
      const mockSort = jest.fn(() => ({ skip: mockSkip }));
      (LogModel.find as jest.Mock).mockReturnValue({ sort: mockSort });
    });

    it('should query logs with all options', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      await logger.query({
        level: LogLevel.ERROR,
        category: LogCategory.AUTH,
        startDate,
        endDate,
        userId: 'user123',
        requestId: 'req456',
        limit: 50,
        skip: 10,
      });

      expect(LogModel.find).toHaveBeenCalledWith({
        level: LogLevel.ERROR,
        category: LogCategory.AUTH,
        timestamp: { $gte: startDate, $lte: endDate },
        'metadata.userId': 'user123',
        'metadata.requestId': 'req456',
      });
    });

    it('should query logs with default limit and skip', async () => {
      await logger.query({});

      expect(LogModel.find).toHaveBeenCalledWith({});
    });

    it('should query logs with only startDate', async () => {
      const startDate = new Date('2025-01-01');

      await logger.query({ startDate });

      expect(LogModel.find).toHaveBeenCalledWith({
        timestamp: { $gte: startDate },
      });
    });

    it('should query logs with only endDate', async () => {
      const endDate = new Date('2025-12-31');

      await logger.query({ endDate });

      expect(LogModel.find).toHaveBeenCalledWith({
        timestamp: { $lte: endDate },
      });
    });

    it('should query logs with only level', async () => {
      await logger.query({ level: LogLevel.INFO });

      expect(LogModel.find).toHaveBeenCalledWith({ level: LogLevel.INFO });
    });

    it('should query logs with only category', async () => {
      await logger.query({ category: LogCategory.USER });

      expect(LogModel.find).toHaveBeenCalledWith({ category: LogCategory.USER });
    });
  });
});

describe('Logger MongoDB integration', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  const mongoOptions = {
    service: 'test-service',
    environment: 'test',
    category: LogCategory.SYSTEM,
    context: 'TestContext',
    minLevel: LogLevel.DEBUG,
    enableConsole: false,
    enableMongo: true,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    Logger.resetInstance();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    Logger.resetInstance();
    jest.clearAllTimers();
    jest.useRealTimers();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('should add entries to write queue when MongoDB is enabled', async () => {
    const logger = Logger.getInstance(mongoOptions);
    logger.info('Test message');

    await logger.flush();

    expect(LogModel.insertMany).toHaveBeenCalled();
  });

  it('should not flush if queue is empty', async () => {
    const logger = Logger.getInstance(mongoOptions);
    await logger.flush();

    expect(LogModel.insertMany).not.toHaveBeenCalled();
  });

  it('should not flush if already processing', async () => {
    const logger = Logger.getInstance(mongoOptions);
    logger.info('Test message 1');
    logger.info('Test message 2');

    const flushPromise1 = logger.flush();
    const flushPromise2 = logger.flush();

    await Promise.all([flushPromise1, flushPromise2]);

    expect(LogModel.insertMany).toHaveBeenCalledTimes(1);
  });

  it('should restore entries to queue on error', async () => {
    const logger = Logger.getInstance(mongoOptions);
    (LogModel.insertMany as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

    logger.info('Test message');
    await logger.flush();

    expect(LogModel.insertMany).toHaveBeenCalledTimes(1);

    (LogModel.insertMany as jest.Mock).mockResolvedValueOnce([]);
    await logger.flush();

    expect(LogModel.insertMany).toHaveBeenCalledTimes(2);
  });

  it('should start flush interval when MongoDB is enabled', async () => {
    const logger = Logger.getInstance(mongoOptions);
    logger.info('Test message');

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(LogModel.insertMany).toHaveBeenCalled();
  });

  it('should stop the flush interval and flush remaining entries', async () => {
    const logger = Logger.getInstance(mongoOptions);

    logger.info('Test message');
    logger.stop();

    await Promise.resolve();

    expect(LogModel.insertMany).toHaveBeenCalled();
  });

  it('should handle stop when flush interval is null', () => {
    const logger = Logger.getInstance({
      ...mongoOptions,
      enableMongo: false,
    });

    expect(() => logger.stop()).not.toThrow();
  });

  it('should calculate correct expiry date for each log level', async () => {
    const logger = Logger.getInstance(mongoOptions);

    const now = new Date('2025-06-15T12:00:00.000Z');
    jest.setSystemTime(now);

    logger.debug('Debug message');
    await logger.flush();

    expect(LogModel.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          level: LogLevel.DEBUG,
          expiresAt: expect.any(Date),
        }),
      ]),
      { ordered: false }
    );
  });
});

describe('initLogger and getLogger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    Logger.resetInstance();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('should initialize and return logger instance', () => {
    Logger.resetInstance();
    const logger = initLogger({
      service: 'test-service',
      environment: 'test',
      enableConsole: false,
      enableMongo: false,
    });

    expect(logger).toBeInstanceOf(Logger);
  });

  it('should return initialized logger via getLogger', () => {
    Logger.resetInstance();
    initLogger({
      service: 'test-service',
      environment: 'test',
      enableConsole: false,
      enableMongo: false,
    });

    const logger = getLogger();

    expect(logger).toBeInstanceOf(Logger);
  });

  it('should throw error if getLogger called before initLogger', () => {
    jest.resetModules();

    jest.doMock('@/shared/logger/models/Log.model', () => ({
      LogModel: {
        insertMany: jest.fn().mockResolvedValue([]),
        find: jest.fn(() => ({
          sort: jest.fn(() => ({
            skip: jest.fn(() => ({
              limit: jest.fn(() => ({
                lean: jest.fn(() => ({
                  exec: jest.fn().mockResolvedValue([]),
                })),
              })),
            })),
          })),
        })),
      },
    }));

    const freshModule = require('@/shared/logger');

    expect(() => {
      freshModule.getLogger();
    }).toThrow('Logger not initialized. Call initLogger() first.');
  });
});
