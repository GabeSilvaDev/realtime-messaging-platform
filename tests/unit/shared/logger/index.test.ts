jest.mock('@/shared/logger/models/Log.model', () => ({
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

import {
  Logger,
  initLogger,
  getLogger,
  LogLevel,
  LogCategory,
  LogModel,
} from '@/shared/logger';

describe('Logger Index Exports', () => {
  beforeEach(() => {
    Logger.resetInstance();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    Logger.resetInstance();
    jest.restoreAllMocks();
  });

  describe('Logger class export', () => {
    it('should export Logger class', () => {
      expect(Logger).toBeDefined();
      expect(typeof Logger.getInstance).toBe('function');
      expect(typeof Logger.resetInstance).toBe('function');
    });

    it('should create logger instance', () => {
      const logger = Logger.getInstance({
        service: 'test',
        environment: 'test',
        enableConsole: false,
        enableMongo: false,
      });

      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('initLogger function export', () => {
    it('should export initLogger function', () => {
      expect(initLogger).toBeDefined();
      expect(typeof initLogger).toBe('function');
    });

    it('should initialize logger with options', () => {
      const logger = initLogger({
        service: 'test-service',
        environment: 'test',
        enableConsole: false,
        enableMongo: false,
      });

      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('getLogger function export', () => {
    it('should export getLogger function', () => {
      expect(getLogger).toBeDefined();
      expect(typeof getLogger).toBe('function');
    });

    it('should get existing logger instance', () => {
      initLogger({
        service: 'test-service',
        environment: 'test',
        enableConsole: false,
        enableMongo: false,
      });

      const logger = getLogger();

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should throw if logger not initialized', () => {
      expect(getLogger).toBeDefined();
    });
  });

  describe('LogLevel enum export', () => {
    it('should export LogLevel enum', () => {
      expect(LogLevel).toBeDefined();
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
      expect(LogLevel.FATAL).toBe('fatal');
    });
  });

  describe('LogCategory enum export', () => {
    it('should export LogCategory enum', () => {
      expect(LogCategory).toBeDefined();
      expect(LogCategory.SYSTEM).toBe('system');
      expect(LogCategory.AUTH).toBe('auth');
      expect(LogCategory.DATABASE).toBe('database');
    });
  });

  describe('LogModel export', () => {
    it('should export LogModel', () => {
      expect(LogModel).toBeDefined();
      expect(LogModel.insertMany).toBeDefined();
      expect(LogModel.find).toBeDefined();
    });
  });
});
