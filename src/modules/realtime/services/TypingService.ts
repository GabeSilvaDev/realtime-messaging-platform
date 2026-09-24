import { REALTIME_CONSTANTS } from '../constants';

/**
 * Timers do indicador "digitando" por (socket, conversa) (RF003.5). Só controla estado e tempo;
 * quem emite os eventos é o handler (via retorno e `onExpire`), então o serviço não depende do
 * Socket.IO. O TTL é injetável para os testes de integração usarem timers reais curtos.
 */
export class TypingService {
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();

  constructor(private readonly ttlMs: number = REALTIME_CONSTANTS.TYPING_TTL_MS) {}

  /**
   * Inicia ou renova o indicador. Retorna `true` só quando ele acabou de ficar ativo (o handler
   * emite `isTyping: true`); renovações retornam `false` (emissões duplicadas são suprimidas).
   * Sem novo `start` dentro do TTL, o par é liberado e `onExpire` roda.
   */
  start(socketId: string, conversationId: string, onExpire: () => void): boolean {
    let bySocket = this.timers.get(socketId);
    if (bySocket === undefined) {
      bySocket = new Map();
      this.timers.set(socketId, bySocket);
    }

    const current = bySocket.get(conversationId);
    if (current !== undefined) {
      clearTimeout(current);
    }

    const conversations = bySocket;
    conversations.set(
      conversationId,
      setTimeout(() => {
        this.forget(socketId, conversations, conversationId);
        onExpire();
      }, this.ttlMs)
    );

    return current === undefined;
  }

  isActive(socketId: string, conversationId: string): boolean {
    return this.timers.get(socketId)?.has(conversationId) === true;
  }

  /** Encerra o indicador; retorna `true` se estava ativo (o handler emite `isTyping: false`). */
  stop(socketId: string, conversationId: string): boolean {
    const bySocket = this.timers.get(socketId);
    const timer = bySocket?.get(conversationId);
    if (bySocket === undefined || timer === undefined) {
      return false;
    }

    clearTimeout(timer);
    this.forget(socketId, bySocket, conversationId);
    return true;
  }

  /** Encerra todos os indicadores do socket (desconexão); retorna as conversas que estavam ativas. */
  stopAll(socketId: string): string[] {
    const bySocket = this.timers.get(socketId);
    if (bySocket === undefined) {
      return [];
    }

    bySocket.forEach((timer) => {
      clearTimeout(timer);
    });
    this.timers.delete(socketId);
    return [...bySocket.keys()];
  }

  /** Total de indicadores ativos. */
  get activeCount(): number {
    let total = 0;
    this.timers.forEach((bySocket) => {
      total += bySocket.size;
    });
    return total;
  }

  private forget(
    socketId: string,
    bySocket: Map<string, NodeJS.Timeout>,
    conversationId: string
  ): void {
    bySocket.delete(conversationId);
    if (bySocket.size === 0) {
      this.timers.delete(socketId);
    }
  }
}
