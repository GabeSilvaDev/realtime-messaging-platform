export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export enum LogCategory {
  SYSTEM = 'system',
  AUTH = 'auth',
  USER = 'user',
  CHAT = 'chat',
  DATABASE = 'database',
  HTTP = 'http',
  WEBSOCKET = 'websocket',
  QUEUE = 'queue',
  CACHE = 'cache',
  NOTIFICATION = 'notification',
}
