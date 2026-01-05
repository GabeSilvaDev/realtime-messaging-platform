import { EventEmitter } from 'events';
import { AuthEventType } from '../constants/auth-events.constants';
import type { AuthEventData } from '../types';

export class AuthEvents {
  private emitter = new EventEmitter();

  on(event: AuthEventType, listener: (data: AuthEventData) => void): void {
    this.emitter.on(event as string, listener);
  }

  off(event: AuthEventType, listener: (data: AuthEventData) => void): void {
    this.emitter.off(event as string, listener);
  }

  emitRegister(userId: string, email: string): void {
    this.emitter.emit(AuthEventType.REGISTER as string, {
      userId,
      email,
      timestamp: new Date(),
    });
  }

  emitLogin(userId: string, email: string): void {
    this.emitter.emit(AuthEventType.LOGIN as string, {
      userId,
      email,
      timestamp: new Date(),
    });
  }

  emitLoginFailed(email: string, reason: string): void {
    this.emitter.emit(AuthEventType.LOGIN_FAILED as string, {
      email,
      reason,
      timestamp: new Date(),
    });
  }

  emitLogout(userId: string): void {
    this.emitter.emit(AuthEventType.LOGOUT as string, {
      userId,
      timestamp: new Date(),
    });
  }

  emitTokenRefresh(userId: string): void {
    this.emitter.emit(AuthEventType.TOKEN_REFRESH as string, {
      userId,
      timestamp: new Date(),
    });
  }

  emitPasswordResetRequest(userId: string, email: string): void {
    this.emitter.emit(AuthEventType.PASSWORD_RESET_REQUEST as string, {
      userId,
      email,
      timestamp: new Date(),
    });
  }

  emitPasswordReset(userId: string): void {
    this.emitter.emit(AuthEventType.PASSWORD_RESET as string, {
      userId,
      timestamp: new Date(),
    });
  }

  emitPasswordChange(userId: string): void {
    this.emitter.emit(AuthEventType.PASSWORD_CHANGE as string, {
      userId,
      timestamp: new Date(),
    });
  }
}

export const authEvents = new AuthEvents();
