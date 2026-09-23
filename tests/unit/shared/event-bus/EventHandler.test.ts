import { EventBus, eventBus } from '@/shared/event-bus/EventBus';
import { EventHandler, createHandler } from '@/shared/event-bus/EventHandler';
import type { BaseEvent } from '@/shared/interfaces';

const TEST_EVENT = 'test:handler-event';

class RecordingHandler extends EventHandler<typeof TEST_EVENT> {
  public readonly eventName = TEST_EVENT;
  public handled: unknown[] = [];
  public beforeCalls = 0;
  public afterCalls = 0;
  public errors: Error[] = [];
  public shouldThrow = false;
  public beforeResult: boolean = true;

  handle(event: BaseEvent<unknown>): void {
    this.handled.push(event.payload);
    if (this.shouldThrow) {
      throw new Error('falha no handle');
    }
  }

  protected override beforeHandle(): boolean {
    this.beforeCalls++;
    return this.beforeResult;
  }

  protected override afterHandle(): void {
    this.afterCalls++;
  }

  protected override onError(_event: BaseEvent<unknown>, error: Error): void {
    this.errors.push(error);
  }
}

class DefaultHooksHandler extends EventHandler<typeof TEST_EVENT> {
  public readonly eventName = TEST_EVENT;
  public handled: unknown[] = [];
  public shouldThrow = false;

  handle(event: BaseEvent<unknown>): void {
    this.handled.push(event.payload);
    if (this.shouldThrow) {
      throw new Error('falha no handle (hooks default)');
    }
  }
}

describe('EventHandler', () => {
  afterEach(() => {
    eventBus.removeAll();
  });

  describe('usando o eventBus padrão (bus não informado no construtor)', () => {
    it('registra, processa o evento com os hooks default e desregistra', async () => {
      const handler = new DefaultHooksHandler();

      expect(handler.registered).toBe(false);

      handler.register();
      expect(handler.registered).toBe(true);

      await eventBus.publish(TEST_EVENT, { value: 1 });
      expect(handler.handled).toEqual([{ value: 1 }]);

      handler.unregister();
      expect(handler.registered).toBe(false);

      await eventBus.publish(TEST_EVENT, { value: 2 });
      expect(handler.handled).toEqual([{ value: 1 }]);
    });

    it('usa a implementação default de onError (não lança e não faz nada) quando handle falha', async () => {
      const handler = new DefaultHooksHandler();
      handler.shouldThrow = true;
      handler.register();

      const statsBefore = eventBus.getStats().totalErrors;
      await expect(eventBus.publish(TEST_EVENT, { value: 1 })).resolves.toBeDefined();

      expect(handler.handled).toEqual([{ value: 1 }]);
      expect(eventBus.getStats().totalErrors).toBe(statsBefore + 1);

      handler.unregister();
    });
  });

  describe('register', () => {
    it('é idempotente: chamar register() novamente não duplica a inscrição', async () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);

      handler.register();
      handler.register();

      expect(bus.subscriberCount(TEST_EVENT)).toBe(1);

      await bus.publish(TEST_EVENT, { value: 1 });
      expect(handler.handled).toEqual([{ value: 1 }]);

      handler.unregister();
    });

    it('repassa this.options para bus.subscribe', () => {
      const bus = EventBus.getInstance();
      const subscribeSpy = jest.spyOn(bus, 'subscribe');
      const handler = new RecordingHandler(bus);
      (handler as unknown as { options: { priority: number } }).options = { priority: 7 };

      handler.register();

      expect(subscribeSpy).toHaveBeenCalledWith(TEST_EVENT, expect.any(Function), {
        priority: 7,
      });

      handler.unregister();
    });

    it('executa beforeHandle, handle e afterHandle em sequência quando beforeHandle retorna true', async () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);
      handler.register();

      await bus.publish(TEST_EVENT, { value: 42 });

      expect(handler.beforeCalls).toBe(1);
      expect(handler.handled).toEqual([{ value: 42 }]);
      expect(handler.afterCalls).toBe(1);
      expect(handler.errors).toEqual([]);

      handler.unregister();
    });

    it('não executa handle nem afterHandle quando beforeHandle retorna false', async () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);
      handler.beforeResult = false;
      handler.register();

      await bus.publish(TEST_EVENT, { value: 42 });

      expect(handler.beforeCalls).toBe(1);
      expect(handler.handled).toEqual([]);
      expect(handler.afterCalls).toBe(0);

      handler.unregister();
    });

    it('chama onError e propaga o erro quando handle lança', async () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);
      handler.shouldThrow = true;
      handler.register();

      const statsBefore = bus.getStats().totalErrors;
      await bus.publish(TEST_EVENT, { value: 1 });

      expect(handler.errors).toHaveLength(1);
      expect(handler.errors[0]?.message).toBe('falha no handle');
      expect(handler.afterCalls).toBe(0);
      // o EventBus captura o erro relançado pelo callback do subscriber e contabiliza como falha
      expect(bus.getStats().totalErrors).toBe(statsBefore + 1);

      handler.unregister();
    });
  });

  describe('unregister', () => {
    it('não faz nada quando o handler nunca foi registrado', () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);

      expect(() => handler.unregister()).not.toThrow();
      expect(handler.registered).toBe(false);
    });

    it('é seguro chamar duas vezes seguidas (segunda chamada é no-op)', () => {
      const bus = EventBus.getInstance();
      const handler = new RecordingHandler(bus);
      handler.register();

      handler.unregister();
      expect(handler.registered).toBe(false);
      expect(bus.subscriberCount(TEST_EVENT)).toBe(0);

      expect(() => handler.unregister()).not.toThrow();
      expect(bus.subscriberCount(TEST_EVENT)).toBe(0);
    });
  });
});

describe('createHandler', () => {
  const FN_EVENT = 'test:handler-fn-event';

  afterEach(() => {
    eventBus.removeAll();
  });

  it('register inscreve o callback e é idempotente (retorna a mesma unsubscribe fn)', async () => {
    const received: unknown[] = [];
    const { register } = createHandler(FN_EVENT, (event) => {
      received.push(event.payload);
    });

    const unsubscribe1 = register();
    const unsubscribe2 = register();

    expect(unsubscribe1).toBe(unsubscribe2);
    expect(eventBus.subscriberCount(FN_EVENT)).toBe(1);

    await eventBus.publish(FN_EVENT, { value: 'a' });
    expect(received).toEqual([{ value: 'a' }]);

    unsubscribe1();
  });

  it('unregister cancela a inscrição e é seguro chamar antes do register ou duas vezes', async () => {
    const received: unknown[] = [];
    const { register, unregister } = createHandler(FN_EVENT, (event) => {
      received.push(event.payload);
    });

    expect(() => unregister()).not.toThrow();

    register();
    expect(eventBus.subscriberCount(FN_EVENT)).toBe(1);

    unregister();
    expect(eventBus.subscriberCount(FN_EVENT)).toBe(0);

    await eventBus.publish(FN_EVENT, { value: 'b' });
    expect(received).toEqual([]);

    expect(() => unregister()).not.toThrow();
  });

  it('repassa as options de inscrição para eventBus.subscribe', () => {
    const subscribeSpy = jest.spyOn(eventBus, 'subscribe');
    const { register, unregister } = createHandler(FN_EVENT, () => undefined, { priority: 3 });

    register();

    expect(subscribeSpy).toHaveBeenCalledWith(FN_EVENT, expect.any(Function), { priority: 3 });

    unregister();
  });
});
