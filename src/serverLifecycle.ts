import type { RealtimeServerHandle } from './modules/realtime/server';
import type { ILogger } from './shared/interfaces';

/** Tempo máximo para o encerramento gracioso antes de forçar a saída do processo. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface StopHandlerDeps {
  realtime: Pick<RealtimeServerHandle, 'close'>;
  shutdown: () => Promise<void>;
  exit: (code: number) => void;
  logger: Pick<ILogger, 'info' | 'error'>;
  /** @default SHUTDOWN_TIMEOUT_MS */
  timeoutMs?: number;
}

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
  deps: Pick<StopHandlerDeps, 'realtime' | 'shutdown' | 'logger'>
): Promise<number> {
  const { realtime, shutdown, logger } = deps;
  let hadError = false;

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
 * Cria o handler de `SIGTERM`/`SIGINT`: encerra o realtime e os bancos (via `closeGracefully`,
 * sempre os dois) e sai do processo com o código resultante. Reentrante-safe — um segundo sinal
 * recebido enquanto o encerramento está em andamento é ignorado. Um timeout (`timeoutMs`, padrão
 * `SHUTDOWN_TIMEOUT_MS`) força `exit(1)` com log se o encerramento gracioso travar (por exemplo,
 * `httpServer.close()` aguardando requisições em andamento); o timer fica `unref`'d desde a
 * criação e é cancelado assim que o encerramento gracioso termina, sem deixar handles abertos.
 */
export function createStopHandler(deps: StopHandlerDeps): (signal: NodeJS.Signals) => void {
  const { realtime, shutdown, exit, logger, timeoutMs = SHUTDOWN_TIMEOUT_MS } = deps;
  let stopping = false;

  return (signal: NodeJS.Signals): void => {
    if (stopping) {
      return;
    }
    stopping = true;

    logger.info(`${signal} recebido: encerrando o servidor`);

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

    void closeGracefully({ realtime, shutdown, logger }).then((code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      exit(code);
    });
  };
}
