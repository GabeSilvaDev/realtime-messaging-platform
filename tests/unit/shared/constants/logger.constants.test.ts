import { LogLevel } from '@/shared/types/logger.types';
import {
  LOG_LEVEL_PRIORITY,
  LOG_RETENTION_DAYS,
  LOG_COLORS,
  RESET_COLOR,
  LOG_FLUSH_INTERVAL_MS,
} from '@/shared/constants/logger.constants';

describe('Logger Constants', () => {
  describe('LOG_LEVEL_PRIORITY', () => {
    it('should have DEBUG as lowest priority', () => {
      expect(LOG_LEVEL_PRIORITY[LogLevel.DEBUG]).toBe(0);
    });

    it('should have FATAL as highest priority', () => {
      expect(LOG_LEVEL_PRIORITY[LogLevel.FATAL]).toBe(4);
    });

    it('should have correct priority order', () => {
      expect(LOG_LEVEL_PRIORITY[LogLevel.DEBUG]).toBeLessThan(LOG_LEVEL_PRIORITY[LogLevel.INFO]);
      expect(LOG_LEVEL_PRIORITY[LogLevel.INFO]).toBeLessThan(LOG_LEVEL_PRIORITY[LogLevel.WARN]);
      expect(LOG_LEVEL_PRIORITY[LogLevel.WARN]).toBeLessThan(LOG_LEVEL_PRIORITY[LogLevel.ERROR]);
      expect(LOG_LEVEL_PRIORITY[LogLevel.ERROR]).toBeLessThan(LOG_LEVEL_PRIORITY[LogLevel.FATAL]);
    });
  });

  describe('LOG_RETENTION_DAYS', () => {
    it('should have shorter retention for DEBUG', () => {
      expect(LOG_RETENTION_DAYS[LogLevel.DEBUG]).toBe(1);
    });

    it('should have longer retention for FATAL', () => {
      expect(LOG_RETENTION_DAYS[LogLevel.FATAL]).toBe(365);
    });
  });

  describe('LOG_COLORS', () => {
    it('should have color codes for all log levels', () => {
      expect(LOG_COLORS[LogLevel.DEBUG]).toBeDefined();
      expect(LOG_COLORS[LogLevel.INFO]).toBeDefined();
      expect(LOG_COLORS[LogLevel.WARN]).toBeDefined();
      expect(LOG_COLORS[LogLevel.ERROR]).toBeDefined();
      expect(LOG_COLORS[LogLevel.FATAL]).toBeDefined();
    });
  });

  describe('RESET_COLOR', () => {
    it('should be the ANSI reset code', () => {
      expect(RESET_COLOR).toBe('\x1b[0m');
    });
  });

  describe('LOG_FLUSH_INTERVAL_MS', () => {
    it('should be 5000ms', () => {
      expect(LOG_FLUSH_INTERVAL_MS).toBe(5000);
    });
  });
});
