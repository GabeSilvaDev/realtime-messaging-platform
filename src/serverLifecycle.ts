import type { RealtimeServerHandle } from './modules/realtime/server';
import type { ILogger } from './shared/interfaces';

/** Tempo máximo para o encerramento gracioso antes de forçar a saída do processo. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface StopHandlerDeps {
  realtime: Pick<RealtimeServerHandle, 'close'>;
  /**
   * Roda antes de fechar o realtime: para o que não pode seguir durante o encerramento (timers
   * de heartbeat/varredura da presença e a ponte dela no EventBus).
   */
  beforeClose?: () => void;
  shutdown: () => Promise<void>;
  exit: (code: number) => void;
  logger: Pick<ILogger, 'info' | 'error'>;
  /** @default SHUTDOWN_TIMEOUT_MS */
  timeoutMs?: number;
}

/** Opções de um pedido de encerramento; `exitCode` é o código mínimo de saída. */
export interface StopOptions {
  exitCode?: number;
}

/** Dispara o encerramento gracioso; `reason` é o sinal ou o motivo (ex.: `uncaughtException`). */
export type StopHandler = (reason: string, options?: StopOptions) => void;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Fecha o realtime e desconecta os bancos, sempre os dois — mesmo que `realtime.close()`
 * rejeite, `shutdown()` roda do mesmo jeito, para os bancos nunca ficarem presos por causa de
 * uma falha isolada no encerramento do Socket.IO. Retorna o código de saída (0 sem erros, 1 se
 * algo falhou), logando cada falha antes de seguir para o próximo passo.
 */
async function closeGracefully(
  deps: Pick<StopHandlerDeps, 'realtime' | 'beforeClose' | 'shutdown' | 'logger'>
): Promise<number> {
  const { realtime, beforeClose, shutdown, logger } = deps;
  let hadError = false;

  try {
    beforeClose?.();
  } catch (error) {
    hadError = true;
    logger.error('Falha ao parar os serviços antes do encerramento', toError(error));
  }

  try {
    await realtime.close();
  } catch (error) {
    hadError = true;
    logger.error('Falha ao fechar o servidor realtime', toError(error));
  }

  try {
    await shutdown();
  } catch (error) {
    hadError = true;
    logger.error('Falha ao desconectar os bancos de dados', toError(error));
  }

  return hadError ? 1 : 0;
}

/**
 * Cria o handler de `SIGTERM`/`SIGINT` (e de falhas fatais, com `exitCode: 1`): encerra o realtime
 * e os bancos (via `closeGracefully`, sempre os dois) e sai do processo com o código resultante —
 * o maior entre o do encerramento e `options.exitCode`. Reentrante-safe — um segundo sinal
 * recebido enquanto o encerramento está em andamento é ignorado. Um timeout (`timeoutMs`, padrão
 * `SHUTDOWN_TIMEOUT_MS`) força `exit(1)` com log se o encerramento gracioso travar (por exemplo,
 * `httpServer.close()` aguardando requisições em andamento); o timer fica `unref`'d desde a
 * criação e é cancelado assim que o encerramento gracioso termina, sem deixar handles abertos.
 */
export function createStopHandler(deps: StopHandlerDeps): StopHandler {
  const { realtime, beforeClose, shutdown, exit, logger, timeoutMs = SHUTDOWN_TIMEOUT_MS } = deps;
  let stopping = false;

  return (reason: string, options: StopOptions = {}): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    const minimumExitCode = options.exitCode ?? 0;

    logger.info(`${reason} recebido: encerrando o servidor`);

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      logger.error(
        'Encerramento gracioso excedeu o tempo limite; forçando a saída',
        new Error(`Encerramento não concluído em ${String(timeoutMs)}ms`)
      );
      exit(1);
    }, timeoutMs);
    timer.unref();

    void closeGracefully({ realtime, beforeClose, shutdown, logger }).then((code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      exit(Math.max(code, minimumExitCode));
    });
  };
}

export interface ProcessErrorHandlerDeps {
  /** O `process` (injetável nos testes). */
  proc: Pick<NodeJS.EventEmitter, 'on'>;
  logger: Pick<ILogger, 'error'>;
  stop: StopHandler;
}

/**
 * Última linha de defesa do processo. `unhandledRejection` só é logada (via logger da aplicação)
 * e o processo segue vivo — uma rejeição solta de uma dependência (ex.: publish do Redis adapter
 * durante uma queda do Redis) não pode derrubar o nó. `uncaughtException` deixa o processo em
 * estado indefinido: loga e dispara o encerramento gracioso com código de saída 1.
 */
export function registerProcessErrorHandlers(deps: ProcessErrorHandlerDeps): void {
  const { proc, logger, stop } = deps;

  proc.on('unhandledRejection', (reason: unknown) => {
    logger.error('Promise rejeitada sem tratamento (processo mantido)', toError(reason));
  });

  proc.on('uncaughtException', (error: Error) => {
    logger.error('Exceção não capturada: encerrando o servidor', error);
    stop('uncaughtException', { exitCode: 1 });
  });
}

/**
 * Handler do evento `error` do servidor HTTP (ex.: `EADDRINUSE` no `listen`): sem ele o erro
 * vira exceção não tratada. Loga e dispara o encerramento gracioso com código de saída 1.
 */
export function createServerErrorHandler(
  deps: Pick<ProcessErrorHandlerDeps, 'logger' | 'stop'>
): (error: Error) => void {
  const { logger, stop } = deps;
  return (error: Error): void => {
    logger.error('Erro no servidor HTTP: encerrando', error);
    stop('httpServerError', { exitCode: 1 });
  };
}
