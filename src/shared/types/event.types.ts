export enum SystemEvents {
  STARTUP = 'system:startup',
  SHUTDOWN = 'system:shutdown',
  ERROR = 'system:error',
}

export enum AuthEvents {
  LOGIN = 'auth:login',
  LOGOUT = 'auth:logout',
  REGISTER = 'auth:register',
  PASSWORD_RESET_REQUESTED = 'auth:password-reset-requested',
  PASSWORD_RESET_COMPLETED = 'auth:password-reset-completed',
}

export enum UserEvents {
  CREATED = 'user:created',
  UPDATED = 'user:updated',
  DELETED = 'user:deleted',
  BLOCKED = 'user:blocked',
  UNBLOCKED = 'user:unblocked',
}

export enum ChatEvents {
  MESSAGE_SENT = 'chat:message-sent',
  MESSAGE_DELIVERED = 'chat:message-delivered',
  MESSAGE_READ = 'chat:message-read',
  TYPING_STARTED = 'chat:typing-started',
  TYPING_STOPPED = 'chat:typing-stopped',
  CONVERSATION_CREATED = 'chat:conversation-created',
}

export enum PresenceEvents {
  ONLINE = 'presence:online',
  OFFLINE = 'presence:offline',
  STATUS_CHANGED = 'presence:status-changed',
}

export enum NotificationEvents {
  SEND = 'notification:send',
  READ = 'notification:read',
}
