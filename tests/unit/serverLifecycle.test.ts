import { EventEmitter } from 'events';
import {
  createServerErrorHandler,
  createStopHandler,
  registerProcessErrorHandlers,
  SHUTDOWN_TIMEOUT_MS,
} from '@/serverLifecycle';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function makeLogger(): { info: jest.Mock; error: jest.Mock } {
  return { info: jest.fn(), error: jest.fn() };
}

describe('createStopHandler', () => {
  it('exporta o timeout padrão de encerramento gracioso', () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBe(10000);
  });

  it('encerramento feliz: fecha o realtime, desconecta os bancos e sai com 0', async () => {
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(logger.info).toHaveBeenCalledWith('SIGTERM recebido: encerrando o servidor');
    expect(realtime.close).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('realtime.close() falha: ainda assim roda shutdown() (bancos não ficam presos), loga e sai com 1', async () => {
    const closeError = new Error('falhou o close do realtime');
    const realtime = { close: jest.fn().mockRejectedValue(closeError) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Falha ao fechar o servidor realtime', closeError);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('beforeClose roda antes de fechar o realtime', async () => {
    const order: string[] = [];
    const realtime = {
      close: jest.fn(async () => {
        order.push('realtime.close');
      }),
    };
    const beforeClose = jest.fn(() => {
      order.push('beforeClose');
    });
    const exit = jest.fn();

    createStopHandler({
      realtime,
      beforeClose,
      shutdown: jest.fn().mockResolvedValue(undefined),
      exit,
      logger: makeLogger(),
    })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(order).toEqual(['beforeClose', 'realtime.close']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('beforeClose falha: loga, fecha o resto mesmo assim e sai com 1', async () => {
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();
    const failure = new Error('timer travado');

    createStopHandler({
      realtime,
      beforeClose: () => {
        throw failure;
      },
      shutdown,
      exit,
      logger,
    })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao parar os serviços antes do encerramento',
      failure
    );
    expect(realtime.close).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('shutdown() falha: loga e sai com 1', async () => {
    const shutdownError = new Error('falhou o shutdown');
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockRejectedValue(shutdownError);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGINT');
    await flushPromises();
    await flushPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao desconectar os bancos de dados',
      shutdownError
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('envolve rejeições que não são Error antes de logar', async () => {
    const realtime = { close: jest.fn().mockRejectedValue('boom') };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao fechar o servidor realtime',
      expect.objectContaining({ message: 'boom' })
    );
  });

  it('reentrância: um segundo sinal recebido durante o encerramento é ignorado', async () => {
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    const stop = createStopHandler({ realtime, shutdown, exit, logger });
    stop('SIGTERM');
    stop('SIGINT');
    await flushPromises();
    await flushPromises();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(realtime.close).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('timeout: força a saída com 1 se o encerramento gracioso travar', async () => {
    let releaseClose: () => void = () => {};
    const closePending = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const realtime = { close: jest.fn().mockReturnValue(closePending) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger, timeoutMs: 20 })('SIGTERM');

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Encerramento gracioso excedeu o tempo limite; forçando a saída',
      expect.any(Error)
    );

    // resolve depois do timeout: o exit não deve ser chamado de novo (guarda "settled")
    releaseClose();
    await flushPromises();
    await flushPromises();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('desreferencia o timer de timeout para não manter o processo vivo (nenhum open handle)', () => {
    const realSetTimeout = global.setTimeout;
    let capturedTimer: NodeJS.Timeout | undefined;
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      capturedTimer = realSetTimeout(...args);
      return capturedTimer;
    }) as typeof setTimeout);

    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGTERM');

    expect(capturedTimer?.hasRef()).toBe(false);

    setTimeoutSpy.mockRestore();
    if (capturedTimer) {
      clearTimeout(capturedTimer);
    }
  });

  it('defesa em profundidade: se o timer disparar mesmo já encerrado, não chama exit de novo', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger, timeoutMs: 20 })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);

    // clearTimeout foi neutralizado: o timer real ainda dispara depois, mas a guarda "settled"
    // impede uma segunda chamada a exit.
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
    expect(exit).toHaveBeenCalledTimes(1);

    clearTimeoutSpy.mockRestore();
  });

  it('motivo de falha (exitCode 1): mesmo com encerramento limpo, sai com 1', async () => {
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('uncaughtException', { exitCode: 1 });
    await flushPromises();
    await flushPromises();

    expect(logger.info).toHaveBeenCalledWith('uncaughtException recebido: encerrando o servidor');
    expect(realtime.close).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('cancela o timer de timeout quando o encerramento gracioso termina antes dele', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();

    createStopHandler({ realtime, shutdown, exit, logger })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore();
  });
});

describe('registerProcessErrorHandlers', () => {
  function setup(): {
    proc: EventEmitter;
    logger: { error: jest.Mock };
    stop: jest.Mock;
  } {
    const proc = new EventEmitter();
    const logger = { error: jest.fn() };
    const stop = jest.fn();
    registerProcessErrorHandlers({ proc, logger, stop });
    return { proc, logger, stop };
  }

  it('unhandledRejection: loga via logger da aplicação e mantém o processo vivo', () => {
    const { proc, logger, stop } = setup();
    const reason = new Error('redis caiu');

    proc.emit('unhandledRejection', reason, Promise.resolve());

    expect(logger.error).toHaveBeenCalledWith(
      'Promise rejeitada sem tratamento (processo mantido)',
      reason
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it('unhandledRejection com motivo que não é Error: envolve antes de logar', () => {
    const { proc, logger } = setup();

    proc.emit('unhandledRejection', 'boom', Promise.resolve());

    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'boom' })
    );
  });

  it('uncaughtException: loga e dispara o encerramento gracioso com código 1', () => {
    const { proc, logger, stop } = setup();
    const error = new Error('bug');

    proc.emit('uncaughtException', error);

    expect(logger.error).toHaveBeenCalledWith(
      'Exceção não capturada: encerrando o servidor',
      error
    );
    expect(stop).toHaveBeenCalledWith('uncaughtException', { exitCode: 1 });
  });
});

describe('createServerErrorHandler', () => {
  it('erro do servidor HTTP (ex.: EADDRINUSE): loga e encerra com código 1', () => {
    const logger = { error: jest.fn() };
    const stop = jest.fn();
    const error = Object.assign(new Error('listen EADDRINUSE: address already in use :::3100'), {
      code: 'EADDRINUSE',
    });

    createServerErrorHandler({ logger, stop })(error);

    expect(logger.error).toHaveBeenCalledWith('Erro no servidor HTTP: encerrando', error);
    expect(stop).toHaveBeenCalledWith('httpServerError', { exitCode: 1 });
  });

  it('com o stop handler real: o processo sai com 1 após o encerramento gracioso', async () => {
    const exit = jest.fn();
    const logger = { info: jest.fn(), error: jest.fn() };
    const stop = createStopHandler({
      realtime: { close: jest.fn().mockResolvedValue(undefined) },
      shutdown: jest.fn().mockResolvedValue(undefined),
      exit,
      logger,
    });

    createServerErrorHandler({ logger, stop })(new Error('boom'));
    await flushPromises();
    await flushPromises();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
