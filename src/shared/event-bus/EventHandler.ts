import type {
  BaseEvent,
  EventMap,
  EventPayload,
  SubscriptionOptions,
  IEventHandler,
} from '../interfaces';
import { EventBus, eventBus } from './EventBus';

export abstract class EventHandler<K extends keyof EventMap> implements IEventHandler<K> {
  public abstract readonly eventName: K;
  protected bus: EventBus;
  protected options: SubscriptionOptions = {};
  private unsubscribeFn: (() => void) | null = null;
  private _registered = false;

  constructor(bus?: EventBus) {
    this.bus = bus ?? eventBus;
  }

  public abstract handle(event: BaseEvent<EventPayload<K>>): Promise<void> | void;

  protected beforeHandle(_event: BaseEvent<EventPayload<K>>): Promise<boolean> | boolean {
    return true;
  }

  protected afterHandle(_event: BaseEvent<EventPayload<K>>): Promise<void> | void {
    return;
  }

  protected onError(_event: BaseEvent<EventPayload<K>>, _error: Error): Promise<void> | void {
    return;
  }

  public register(): void {
    if (this._registered) {
      return;
    }

    this.unsubscribeFn = this.bus.subscribe(
      this.eventName,
      async (event) => {
        try {
          const shouldContinue = await this.beforeHandle(event);
          if (!shouldContinue) {
            return;
          }

          await Promise.resolve(this.handle(event));
          await this.afterHandle(event);
        } catch (error) {
          await this.onError(event, error as Error);
          throw error;
        }
      },
      this.options
    );

    this._registered = true;
  }

  public unregister(): void {
    if (!this._registered || this.unsubscribeFn === null) {
      return;
    }

    this.unsubscribeFn();
    this.unsubscribeFn = null;
    this._registered = false;
  }

  public get registered(): boolean {
    return this._registered;
  }
}

export function createHandler<K extends keyof EventMap>(
  eventName: K,
  handler: (event: BaseEvent<EventPayload<K>>) => Promise<void> | void,
  options?: SubscriptionOptions
): { register: () => () => void; unregister: () => void } {
  let unsubscribeFn: (() => void) | null = null;

  return {
    register(): () => void {
      if (unsubscribeFn !== null) {
        return unsubscribeFn;
      }
      unsubscribeFn = eventBus.subscribe(eventName, handler, options);
      return unsubscribeFn;
    },
    unregister(): void {
      if (unsubscribeFn !== null) {
        unsubscribeFn();
        unsubscribeFn = null;
      }
    },
  };
}
