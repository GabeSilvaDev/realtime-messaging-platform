import { SERVER_EVENTS, userRoom } from '@/modules/realtime/constants';
import type { PresenceUpdatePayload, RealtimeServer } from '@/modules/realtime/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { PresenceEvents, UserEvents } from '@/shared/types';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';

export interface PresenceBridgeDeps {
  presence?: Pick<IPresenceService, 'presenceAudience' | 'getStates' | 'getVisibleStates'>;
  bus?: Pick<EventBus, 'subscribe'>;
}

/** Visto por quem tem bloqueio com o usuário: sempre offline, sem "visto por último". */
function hidden(userId: string): PresenceUpdatePayload {
  return { userId, state: 'offline', lastSeenAt: null };
}

/**
 * Ponte EventBus → Socket.IO da presença: `presence:online/offline/status-changed` viram
 * `presence:update { userId, state, lastSeenAt }` para as rooms `user:<id>` da audiência (quem tem
 * o usuário como contato ∪ parceiros 1:1, menos bloqueios). A mudança de status manual também vai
 * para o próprio usuário (sincroniza as outras abas).
 *
 * `online`/`offline`/`status-changed` NUNCA emitem o que o payload do evento sugere: sempre releem
 * o estado atual (`getStates`) na hora de emitir. Isso importa porque `PresenceService.disconnect`/
 * `sweep` gravam `last_seen_at` no Postgres antes de publicar `presence:offline` — se o usuário
 * reconectar nesse meio-tempo, o `presence:online` seguinte pode ser publicado (e processado, já
 * que cada evento só entra na fila do usuário quando `bus.publish` é chamado) antes desse `offline`
 * atrasado. Sem reler, esse `offline` obsoleto sairia por cima do estado online real. Como a fila
 * por usuário serializa o PROCESSAMENTO (não só a emissão) — um evento só começa a ler o Redis
 * depois que o anterior termina —, a releitura sempre reflete o estado mais recente conhecido,
 * mesmo quando os eventos chegam fora da ordem real dos acontecimentos.
 *
 * Bloqueio: `user:blocked` faz cada lado ver o outro `offline` na hora. `user:unblocked` NÃO
 * emite o estado bruto (`getStates`): bloqueio é por direção (A bloquear B não implica B ter
 * bloqueado A), então o desbloqueio de um lado pode acontecer com o outro lado ainda bloqueando de
 * volta. Por isso `user:unblocked` usa `getVisibleStates(viewer, [subject])`, que já aplica o
 * filtro dos dois sentidos: se ainda houver bloqueio em qualquer direção entre os dois, o estado
 * visto continua `offline` (mesma aparência de `user:blocked`, por consistência); só quando os dois
 * lados estiverem livres o estado real é revelado.
 *
 * Os subscribers devolvem a promise da fila (quem publica espera a emissão); falhas na leitura são
 * logadas e nunca propagam. Retorna a função que cancela as inscrições.
 */
export function registerPresenceBridge(
  io: Pick<RealtimeServer, 'to'>,
  { presence = presenceService, bus = eventBus }: PresenceBridgeDeps = {}
): () => void {
  const queues = new Map<string, Promise<void>>();

  const enqueue = (userId: string, task: () => Promise<void>): Promise<void> => {
    const next = (queues.get(userId) ?? Promise.resolve()).then(task).catch((error: unknown) => {
      logger.error(
        'Falha ao avisar a mudança de presença',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    });
    queues.set(userId, next);
    // Roda nos dois desfechos (não só `.then(onFulfilled)`): `next` só rejeita se o próprio
    // `logger.error` do catch acima lançar — sem limpar também nesse caso, a entrada nunca seria
    // removida e o próximo evento deste usuário encadearia sobre uma promise já rejeitada para
    // sempre (fila travada). A falha é só logada; não propaga (nada aguarda esta promise).
    const cleanup = (): void => {
      if (queues.get(userId) === next) {
        queues.delete(userId);
      }
    };
    void next.then(cleanup, (error: unknown) => {
      cleanup();
      logger.error(
        'Falha ao limpar a fila de presença do usuário',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    });
    return next;
  };

  const emit = (rooms: string[], payload: PresenceUpdatePayload): void => {
    if (rooms.length > 0) {
      io.to(rooms).emit(SERVER_EVENTS.PRESENCE_UPDATE, payload);
    }
  };

  /** Estado real atual (lido na hora da emissão); `null` se o usuário não veio na leitura. */
  const currentState = async (userId: string): Promise<PresenceUpdatePayload | null> => {
    const entry = (await presence.getStates([userId])).get(userId);
    return entry === undefined ? null : { userId, ...entry };
  };

  const notifyAudience = (userId: string, extraRooms: string[] = []): Promise<void> =>
    enqueue(userId, async () => {
      const audience = await presence.presenceAudience(userId);
      const payload = await currentState(userId);
      if (payload !== null) {
        emit([...audience.map(userRoom), ...extraRooms], payload);
      }
    });

  const unsubscribers = [
    bus.subscribe(PresenceEvents.ONLINE, ({ payload: { userId } }) => notifyAudience(userId)),

    bus.subscribe(PresenceEvents.OFFLINE, ({ payload: { userId } }) => notifyAudience(userId)),

    bus.subscribe(PresenceEvents.STATUS_CHANGED, ({ payload: { userId } }) =>
      notifyAudience(userId, [userRoom(userId)])
    ),

    bus.subscribe(UserEvents.BLOCKED, async ({ payload: { userId, blockedUserId } }) => {
      await Promise.all([
        enqueue(userId, () => {
          emit([userRoom(blockedUserId)], hidden(userId));
          return Promise.resolve();
        }),
        enqueue(blockedUserId, () => {
          emit([userRoom(userId)], hidden(blockedUserId));
          return Promise.resolve();
        }),
      ]);
    }),

    bus.subscribe(UserEvents.UNBLOCKED, async ({ payload: { userId, unblockedUserId } }) => {
      // Estado de `subject` como `viewer` o vê: `getVisibleStates` reaplica o filtro de bloqueio
      // dos dois sentidos (nunca `getStates`/`currentState`, que ignoram bloqueio) — se `viewer`
      // ainda bloquear `subject` (ou vice-versa) por fora deste evento, o estado revelado continua
      // `offline`.
      const reveal = (subject: string, viewer: string): Promise<void> =>
        enqueue(subject, async () => {
          const [payload] = await presence.getVisibleStates(viewer, [subject]);
          if (payload !== undefined) {
            emit([userRoom(viewer)], payload);
          }
        });
      await Promise.all([reveal(userId, unblockedUserId), reveal(unblockedUserId, userId)]);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
