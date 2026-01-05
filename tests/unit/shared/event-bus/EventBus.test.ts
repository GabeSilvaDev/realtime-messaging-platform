import { EventBus } from '@/shared/event-bus/EventBus';

describe('EventBus static null instance', () => {
  it('should handle resetInstance when instance is null', () => {
    (EventBus as any).instance = null;

    expect(() => EventBus.resetInstance()).not.toThrow();

    const instance = EventBus.getInstance();
    expect(instance).toBeDefined();
  });
});

describe('EventBus', () => {
  let eventBus: EventBus;

  const userCreatedPayload = { userId: '123', email: 'test@example.com' };
  const userUpdatedPayload = { userId: '123', fields: ['name'] };

  beforeEach(() => {
    EventBus.resetInstance();
    eventBus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('resetInstance', () => {
    it('should reset the singleton instance', () => {
      const instance1 = EventBus.getInstance();
      EventBus.resetInstance();
      const instance2 = EventBus.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should do nothing if instance is null', () => {
      EventBus.resetInstance();
      EventBus.resetInstance();
      expect(EventBus.getInstance()).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = eventBus.getStats();

      expect(stats.totalPublished).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.subscriberCount).toBe(0);
    });
  });

  describe('publish', () => {
    it('should publish an event and return event id', async () => {
      const eventId = await eventBus.publish('user:created', userCreatedPayload);

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
    });

    it('should increment stats on publish', async () => {
      await eventBus.publish('user:created', userCreatedPayload);
      const stats = eventBus.getStats();

      expect(stats.totalPublished).toBe(1);
      expect(stats.eventsByType['user:created']).toBe(1);
    });

    it('should call subscriber callback when event is published', async () => {
      const callback = jest.fn();
      eventBus.subscribe('user:created', callback);

      await eventBus.publish('user:created', userCreatedPayload);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'user:created',
          payload: userCreatedPayload,
        })
      );
    });

    it('should pass metadata to event', async () => {
      const callback = jest.fn();
      eventBus.subscribe('user:created', callback);

      await eventBus.publish('user:created', userCreatedPayload, { metadata: { source: 'test' } });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { source: 'test' },
        })
      );
    });

    it('should call subscribers in priority order', async () => {
      const callOrder: number[] = [];

      eventBus.subscribe(
        'user:created',
        () => {
          callOrder.push(1);
        },
        { priority: 1 }
      );
      eventBus.subscribe(
        'user:created',
        () => {
          callOrder.push(2);
        },
        { priority: 10 }
      );
      eventBus.subscribe(
        'user:created',
        () => {
          callOrder.push(3);
        },
        { priority: 5 }
      );

      await eventBus.publish('user:created', userCreatedPayload);

      expect(callOrder).toEqual([2, 3, 1]);
    });

    it('should handle async option', async () => {
      const callback = jest.fn();
      eventBus.subscribe('user:created', callback);

      const eventId = await eventBus.publish('user:created', userCreatedPayload, { async: true });

      expect(eventId).toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callback).toHaveBeenCalled();
    });

    it('should increment totalErrors when subscriber throws', async () => {
      eventBus.subscribe('user:created', () => {
        throw new Error('Test error');
      });

      await eventBus.publish('user:created', userCreatedPayload);
      const stats = eventBus.getStats();

      expect(stats.totalErrors).toBe(1);
    });

    it('should continue processing after subscriber error', async () => {
      const callback1 = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const callback2 = jest.fn();

      eventBus.subscribe('user:created', callback1, { priority: 10 });
      eventBus.subscribe('user:created', callback2, { priority: 1 });

      await eventBus.publish('user:created', userCreatedPayload);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should increment totalProcessed for each successful subscriber', async () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:created', jest.fn());

      await eventBus.publish('user:created', userCreatedPayload);
      const stats = eventBus.getStats();

      expect(stats.totalProcessed).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      const unsubscribe = eventBus.subscribe('user:created', jest.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should increment subscriber count', () => {
      eventBus.subscribe('user:created', jest.fn());

      expect(eventBus.subscriberCount()).toBe(1);
    });

    it('should allow multiple subscribers to same event', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:created', jest.fn());

      expect(eventBus.subscriberCount('user:created')).toBe(2);
    });

    it('should unsubscribe when calling returned function', async () => {
      const callback = jest.fn();
      const unsubscribe = eventBus.subscribe('user:created', callback);

      unsubscribe();
      await eventBus.publish('user:created', userCreatedPayload);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should decrement subscriber count on unsubscribe', () => {
      const unsubscribe = eventBus.subscribe('user:created', jest.fn());

      expect(eventBus.subscriberCount()).toBe(1);
      unsubscribe();
      expect(eventBus.subscriberCount()).toBe(0);
    });
  });

  describe('once', () => {
    it('should only call subscriber once', async () => {
      const callback = jest.fn();
      eventBus.once('user:created', callback);

      await eventBus.publish('user:created', userCreatedPayload);
      await eventBus.publish('user:created', { userId: '456', email: 'other@example.com' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const unsubscribe = eventBus.once('user:created', jest.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should decrement subscriber count after being called', async () => {
      eventBus.once('user:created', jest.fn());

      expect(eventBus.subscriberCount()).toBe(1);
      await eventBus.publish('user:created', userCreatedPayload);
      expect(eventBus.subscriberCount()).toBe(0);
    });
  });

  describe('onAny', () => {
    it('should call wildcard callback for any event', async () => {
      const callback = jest.fn();
      eventBus.onAny(callback);

      await eventBus.publish('user:created', userCreatedPayload);
      await eventBus.publish('user:updated', userUpdatedPayload);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should receive event name and full event', async () => {
      const callback = jest.fn();
      eventBus.onAny(callback);

      await eventBus.publish('user:created', userCreatedPayload);

      expect(callback).toHaveBeenCalledWith(
        'user:created',
        expect.objectContaining({
          name: 'user:created',
          payload: userCreatedPayload,
        })
      );
    });

    it('should return unsubscribe function', async () => {
      const callback = jest.fn();
      const unsubscribe = eventBus.onAny(callback);

      unsubscribe();
      await eventBus.publish('user:created', userCreatedPayload);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should increment totalErrors when wildcard callback throws', async () => {
      eventBus.onAny(() => {
        throw new Error('Wildcard error');
      });

      await eventBus.publish('user:created', userCreatedPayload);
      const stats = eventBus.getStats();

      expect(stats.totalErrors).toBe(1);
    });
  });

  describe('subscriberCount', () => {
    it('should return 0 when no subscribers', () => {
      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should return count for specific event', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      expect(eventBus.subscriberCount('user:created')).toBe(2);
      expect(eventBus.subscriberCount('user:updated')).toBe(1);
    });

    it('should return total count without event name', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      expect(eventBus.subscriberCount()).toBe(2);
    });
  });

  describe('hasSubscribers', () => {
    it('should return false when no subscribers for event', () => {
      expect(eventBus.hasSubscribers('user:created')).toBe(false);
    });

    it('should return true when has subscribers', () => {
      eventBus.subscribe('user:created', jest.fn());

      expect(eventBus.hasSubscribers('user:created')).toBe(true);
    });

    it('should return false after all subscribers unsubscribe', () => {
      const unsubscribe = eventBus.subscribe('user:created', jest.fn());

      expect(eventBus.hasSubscribers('user:created')).toBe(true);
      unsubscribe();
      expect(eventBus.hasSubscribers('user:created')).toBe(false);
    });
  });

  describe('removeAll', () => {
    it('should reset subscriber count to 0', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      eventBus.removeAll();

      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should remove subscribers for specific event', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      eventBus.removeAll('user:created');

      expect(eventBus.subscriberCount('user:created')).toBe(0);
      expect(eventBus.subscriberCount('user:updated')).toBe(1);
    });

    it('should remove wildcard subscribers when no event specified', () => {
      const callback = jest.fn();
      eventBus.onAny(callback);
      eventBus.removeAll();

      eventBus.publish('user:created', userCreatedPayload);
      expect(eventBus.subscriberCount()).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset stats but keep subscriber count', async () => {
      eventBus.subscribe('user:created', jest.fn());
      await eventBus.publish('user:created', userCreatedPayload);

      eventBus.resetStats();
      const stats = eventBus.getStats();

      expect(stats.totalPublished).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.eventsByType).toEqual({});
      expect(stats.subscriberCount).toBe(1);
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is published', async () => {
      const promise = eventBus.waitFor('user:created');

      setTimeout(() => {
        void eventBus.publish('user:created', userCreatedPayload);
      }, 10);

      const event = await promise;

      expect(event.name).toBe('user:created');
      expect(event.payload).toEqual(userCreatedPayload);
    });

    it('should timeout if event is not published', async () => {
      const promise = eventBus.waitFor('user:created', 50);

      await expect(promise).rejects.toThrow('Timeout waiting for event: user:created');
    });

    it('should clear timeout when event is received', async () => {
      const promise = eventBus.waitFor('user:created', 1000);

      await eventBus.publish('user:created', userCreatedPayload);

      const event = await promise;
      expect(event.name).toBe('user:created');
    });

    it('should work without timeout', async () => {
      const promise = eventBus.waitFor('user:created');

      setTimeout(() => {
        void eventBus.publish('user:created', userCreatedPayload);
      }, 10);

      const event = await promise;
      expect(event.name).toBe('user:created');
    });
  });

  describe('unsubscribe edge cases', () => {
    it('should handle unsubscribing already removed subscriber', async () => {
      const callback = jest.fn();
      const unsubscribe = eventBus.subscribe('user:created', callback);

      unsubscribe();
      unsubscribe();

      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should not decrement count when subscriber not found', () => {
      eventBus.subscribe('user:created', jest.fn());
      const initialCount = eventBus.subscriberCount();

      const unsubscribe = eventBus.subscribe('user:created', jest.fn());
      unsubscribe();
      unsubscribe();

      expect(eventBus.subscriberCount()).toBe(initialCount);
    });

    it('should handle unsubscribe when event has no subscribers map', async () => {
      const unsubscribe = eventBus.subscribe('user:created', jest.fn());
      eventBus.removeAll('user:created');

      unsubscribe();

      expect(eventBus.subscriberCount()).toBe(0);
    });
  });

  describe('resetInstance edge cases', () => {
    it('should properly reset when instance exists with subscribers', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      expect(eventBus.subscriberCount()).toBe(2);

      EventBus.resetInstance();
      const newInstance = EventBus.getInstance();

      expect(newInstance.subscriberCount()).toBe(0);
    });

    it('should do nothing when instance is null', () => {
      EventBus.resetInstance();
      EventBus.resetInstance();

      expect(() => EventBus.resetInstance()).not.toThrow();
    });
  });

  describe('removeAll with specific event', () => {
    it('should only remove subscribers for specified event and update count', () => {
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:created', jest.fn());
      eventBus.subscribe('user:updated', jest.fn());

      expect(eventBus.subscriberCount()).toBe(3);

      eventBus.removeAll('user:created');

      expect(eventBus.subscriberCount()).toBe(1);
      expect(eventBus.subscriberCount('user:created')).toBe(0);
      expect(eventBus.subscriberCount('user:updated')).toBe(1);
    });

    it('should handle removeAll for event with no subscribers', () => {
      eventBus.subscribe('user:updated', jest.fn());

      eventBus.removeAll('user:created');

      expect(eventBus.subscriberCount()).toBe(1);
    });
  });
});
