import {
  EventBus,
  eventBus,
  EventHandler,
  createHandler,
  SystemEvents,
  AuthEvents,
  UserEvents,
  ChatEvents,
  PresenceEvents,
  NotificationEvents,
} from '@/shared/event-bus';

describe('shared/event-bus index', () => {
  it('deve exportar EventBus e a instância eventBus', () => {
    expect(EventBus).toBeDefined();
    expect(typeof EventBus).toBe('function');
    expect(eventBus).toBeInstanceOf(EventBus);
  });

  it('deve exportar EventHandler e createHandler', () => {
    expect(EventHandler).toBeDefined();
    expect(typeof createHandler).toBe('function');
  });

  it('deve exportar os enums de eventos re-exportados de shared/types', () => {
    expect(SystemEvents.STARTUP).toBe('system:startup');
    expect(AuthEvents.LOGIN).toBe('auth:login');
    expect(UserEvents.CREATED).toBe('user:created');
    expect(ChatEvents.MESSAGE_SENT).toBe('chat:message-sent');
    expect(PresenceEvents.ONLINE).toBe('presence:online');
    expect(NotificationEvents.SEND).toBe('notification:send');
  });
});
