// Socket/io falsos para os unit tests do módulo realtime. Não é arquivo de teste (não casa com
// testMatch). Funções jest.fn() são criadas a cada chamada (resetMocks:true não as afeta).
import type { RealtimeServer, RealtimeSocket, SocketData } from '@/modules/realtime/types';

export interface FakeBroadcast {
  emit: jest.Mock;
}

export interface FakeSocket {
  id: string;
  data: Partial<SocketData>;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, string | undefined>;
    address: string;
  };
  /** Rooms atuais (começa com a room do próprio id, como no Socket.IO). */
  rooms: Set<string>;
  connected: boolean;
  /** Adiciona a(s) room(s) em `rooms`. */
  join: jest.Mock;
  /** Remove a room de `rooms`. */
  leave: jest.Mock;
  /** Marca `connected = false`. */
  disconnect: jest.Mock;
  on: jest.Mock;
  to: jest.Mock;
  /** Emissões feitas via `socket.to(room).emit(...)`, na ordem: `[room, event, payload]`. */
  broadcasts: [string, string, unknown][];
  /** Handlers registrados com `socket.on(event, handler)`. */
  handlers: Map<string, (...args: unknown[]) => void>;
  asSocket(): RealtimeSocket;
}

export function createFakeSocket(
  overrides: Partial<Pick<FakeSocket, 'id' | 'data'>> = {}
): FakeSocket {
  const broadcasts: [string, string, unknown][] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = overrides.id ?? 'socket-1';
  const rooms = new Set<string>([id]);
  const socket: FakeSocket = {
    id,
    data: overrides.data ?? {},
    handshake: { auth: {}, headers: {}, address: '127.0.0.1' },
    rooms,
    connected: true,
    join: jest.fn((room: string | string[]) => {
      (Array.isArray(room) ? room : [room]).forEach((name) => rooms.add(name));
    }),
    leave: jest.fn((room: string) => {
      rooms.delete(room);
    }),
    disconnect: jest.fn(() => {
      socket.connected = false;
      return socket;
    }),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        broadcasts.push([room, event, payload]);
        return true;
      },
    })),
    broadcasts,
    handlers,
    asSocket: () => socket as unknown as RealtimeSocket,
  };
  return socket;
}

export interface FakeServer {
  /** Emissões `io.to(rooms).emit(event, payload)`: `[rooms, event, payload]` (rooms sempre array). */
  emits: [string[], string, unknown][];
  /** Chamadas `io.in(room).socketsJoin(target)` e `socketsLeave`: `[room, target]`. */
  joins: [string, string][];
  leaves: [string, string][];
  to: jest.Mock;
  in: jest.Mock;
  asServer(): RealtimeServer;
}

export function createFakeServer(): FakeServer {
  const emits: [string[], string, unknown][] = [];
  const joins: [string, string][] = [];
  const leaves: [string, string][] = [];
  const server: FakeServer = {
    emits,
    joins,
    leaves,
    to: jest.fn((rooms: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emits.push([Array.isArray(rooms) ? rooms : [rooms], event, payload]);
        return true;
      },
    })),
    in: jest.fn((room: string) => ({
      socketsJoin: (target: string) => {
        joins.push([room, target]);
      },
      socketsLeave: (target: string) => {
        leaves.push([room, target]);
      },
    })),
    asServer: () => server as unknown as RealtimeServer,
  };
  return server;
}
