describe('database config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getRequiredEnv', () => {
    it('should throw error when required environment variable is empty string', () => {
      const testEnv: NodeJS.ProcessEnv = { ...originalEnv, POSTGRES_USER: '' };

      jest.isolateModules(() => {
        process.env = testEnv;
        expect(() => {
          require('@/shared/config/database');
        }).toThrow('Missing required environment variable: POSTGRES_USER');
      });
    });
  });

  describe('env defaults', () => {
    it('should use NODE_ENV when defined', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        NODE_ENV: 'production',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config.env).toBe('production');
      });
    });

    it('should default to development when NODE_ENV is undefined', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };
      delete testEnv.NODE_ENV;

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config.env).toBe('development');
      });
    });

    it('should use DEFAULT_PORT when PORT is not a valid number', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        PORT: 'not-a-number',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config.port).toBe(3000);
      });
    });
  });

  describe('config object', () => {
    it('should load config when all required env vars are present', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config).toBeDefined();
        expect(config.database).toBeDefined();
        expect(config.database.development).toBeDefined();
      });
    });

    it('should use default port when PORT is not set', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };
      delete testEnv.PORT;

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config.port).toBe(3000);
      });
    });

    it('should use environment PORT when set', () => {
      const testEnv: NodeJS.ProcessEnv = {
        ...originalEnv,
        PORT: '4000',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      };

      jest.isolateModules(() => {
        process.env = testEnv;
        const { default: config } = require('@/shared/config/database');
        expect(config.port).toBe(4000);
      });
    });
  });
});
