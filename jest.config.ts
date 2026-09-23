import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // wiring do processo (conexão com bancos, start do servidor), não é lógica testável em isolamento
    '!src/server.ts',
    '!src/bootstrap.ts',
    '!src/database/migrations/**',
    '!src/database/seeders/**',
    // ferramental de geração de dados de teste, não código de produção
    '!src/database/factories/**',
    // apenas tipos (interfaces/type aliases); o único import do arquivo existe só para o
    // compilador resolver as chaves computadas dos enums na interface EventMap e nunca
    // é executado em runtime (nenhum código real importa este módulo por valor)
    '!src/shared/interfaces/event.interfaces.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!(uuid)/)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  maxWorkers: '50%',
};

export default config;
