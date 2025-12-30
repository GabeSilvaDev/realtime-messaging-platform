import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  BaseEvent,
  EventMap,
  EventPayload,
  EventCallback,
  WildcardCallback,
  SubscriptionOptions,
  PublishOptions,
  EventBusStats,
  Subscriber,
} from '../interfaces';

export class EventBus {
  private static instance: EventBus | null = null;
  private emitter: EventEmitter;
  private subscribers: Map<string, Subscriber[]>;
  private wildcardSubscribers: Set<WildcardCallback>;
  private stats: EventBusStats;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.subscribers = new Map();
    this.wildcardSubscribers = new Set();
    this.stats = {
      totalPublished: 0,
      totalProcessed: 0,
      totalErrors: 0,
      subscriberCount: 0,
      eventsByType: {},
    };
  }

  public static getInstance(): EventBus {
    EventBus.instance ??= new EventBus();
    return EventBus.instance;
  }

  public static resetInstance(): void {
    if (EventBus.instance !== null) {
      EventBus.instance.removeAll();
      EventBus.instance = new EventBus();
    }
  }

  public async publish<K extends keyof EventMap>(
    eventName: K,
    payload: EventPayload<K>,
    options: PublishOptions = {}
  ): Promise<string> {
    const eventId = randomUUID();
    const event: BaseEvent<EventPayload<K>> = {
      name: eventName as string,
      payload,
      timestamp: new Date(),
      eventId,
      metadata: options.metadata,
    };

    this.stats.totalPublished++;
    this.stats.eventsByType[eventName as string] =
      (this.stats.eventsByType[eventName as string] ?? 0) + 1;

    const execute = async (): Promise<void> => {
      for (const wildcardCallback of this.wildcardSubscribers) {
        try {
          await Promise.resolve(wildcardCallback(eventName as string, event));
        } catch {
          this.stats.totalErrors++;
        }
      }

      const eventSubscribers = this.subscribers.get(eventName as string) ?? [];
      const sortedSubscribers = [...eventSubscribers].sort(
        (a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0)
      );

      for (const subscriber of sortedSubscribers) {
        try {
          await Promise.resolve((subscriber.callback as EventCallback<K>)(event));
          this.stats.totalProcessed++;

          if (subscriber.options.once === true) {
            this.unsubscribe(eventName as string, subscriber.id);
          }
        } catch {
          this.stats.totalErrors++;
        }
      }

      this.emitter.emit(eventName as string, event);
    };

    if (options.async === true) {
      setImmediate(() => {
        void execute();
      });
    } else {
      await execute();
    }

    return eventId;
  }

  public subscribe<K extends keyof EventMap>(
    eventName: K,
    callback: EventCallback<K>,
    options: SubscriptionOptions = {}
  ): () => void {
    const subscriberId = randomUUID();
    const subscriber: Subscriber<K> = {
      id: subscriberId,
      callback,
      options,
    };

    const eventNameStr = eventName as string;
    const existing = this.subscribers.get(eventNameStr);
    if (existing !== undefined) {
      existing.push(subscriber as Subscriber);
    } else {
      this.subscribers.set(eventNameStr, [subscriber as Subscriber]);
    }
    this.stats.subscriberCount++;

    return () => {
      this.unsubscribe(eventNameStr, subscriberId);
    };
  }

  public once<K extends keyof EventMap>(
    eventName: K,
    callback: EventCallback<K>,
    options: Omit<SubscriptionOptions, 'once'> = {}
  ): () => void {
    return this.subscribe(eventName, callback, { ...options, once: true });
  }

  public onAny(callback: WildcardCallback): () => void {
    this.wildcardSubscribers.add(callback);
    return () => {
      this.wildcardSubscribers.delete(callback);
    };
  }

  private unsubscribe(eventName: string, subscriberId: string): void {
    const eventSubscribers = this.subscribers.get(eventName);
    if (eventSubscribers !== undefined) {
      const index = eventSubscribers.findIndex((s) => s.id === subscriberId);
      if (index !== -1) {
        eventSubscribers.splice(index, 1);
        this.stats.subscriberCount--;
      }
    }
  }

  public removeAll(eventName?: keyof EventMap): void {
    if (eventName !== undefined) {
      const count = this.subscribers.get(eventName as string)?.length ?? 0;
      this.subscribers.delete(eventName as string);
      this.stats.subscriberCount -= count;
    } else {
      this.subscribers.clear();
      this.wildcardSubscribers.clear();
      this.stats.subscriberCount = 0;
    }
  }

  public hasSubscribers(eventName: keyof EventMap): boolean {
    const subs = this.subscribers.get(eventName as string);
    return subs !== undefined && subs.length > 0;
  }

  public subscriberCount(eventName?: keyof EventMap): number {
    if (eventName !== undefined) {
      return this.subscribers.get(eventName as string)?.length ?? 0;
    }
    return this.stats.subscriberCount;
  }

  public getStats(): EventBusStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      totalPublished: 0,
      totalProcessed: 0,
      totalErrors: 0,
      subscriberCount: this.stats.subscriberCount,
      eventsByType: {},
    };
  }

  public waitFor<K extends keyof EventMap>(
    eventName: K,
    timeout?: number
  ): Promise<BaseEvent<EventPayload<K>>> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const unsubscribe = this.once(eventName, (event) => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        resolve(event);
      });

      if (timeout !== undefined && timeout > 0) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventName as string}`));
        }, timeout);
      }
    });
  }
}

export const eventBus = EventBus.getInstance();
