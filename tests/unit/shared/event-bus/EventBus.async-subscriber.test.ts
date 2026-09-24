import { EventBus } from '@/shared/event-bus/EventBus';

/** Deixa rodar os callbacks agendados com setImmediate e as promises encadeadas a eles. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('EventBus — subscriber com { async: true }', () => {
  const payload = { userId: '123', email: 'test@example.com' };
  let bus: EventBus;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('publish resolve sem esperar o subscriber assíncrono, que roda logo depois', async () => {
    const order: string[] = [];
    bus.subscribe(
      'user:created',
      () => {
        order.push('async');
      },
      { async: true }
    );
    bus.subscribe('user:created', () => {
      order.push('sync');
    });

    await bus.publish('user:created', payload);
    expect(order).toEqual(['sync']);

    await flushDetached();
    expect(order).toEqual(['sync', 'async']);
    expect(bus.getStats().totalProcessed).toBe(2);
  });

  it('erro no subscriber assíncrono não propaga e conta em totalErrors', async () => {
    bus.subscribe(
      'user:created',
      async () => {
        throw new Error('falhou');
      },
      { async: true }
    );

    await expect(bus.publish('user:created', payload)).resolves.toEqual(expect.any(String));
    await flushDetached();

    expect(bus.getStats().totalErrors).toBe(1);
    expect(bus.getStats().totalProcessed).toBe(0);
  });

  it('erro síncrono (throw) no subscriber assíncrono também é contido', async () => {
    bus.subscribe(
      'user:created',
      () => {
        throw new Error('falhou');
      },
      { async: true }
    );

    await bus.publish('user:created', payload);
    await flushDetached();

    expect(bus.getStats().totalErrors).toBe(1);
  });

  it('com once, é desinscrito no despacho e roda uma única vez', async () => {
    const callback = jest.fn();
    bus.subscribe('user:created', callback, { async: true, once: true });

    await bus.publish('user:created', payload);
    expect(bus.subscriberCount('user:created')).toBe(0);
    await bus.publish('user:created', payload);
    await flushDetached();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
