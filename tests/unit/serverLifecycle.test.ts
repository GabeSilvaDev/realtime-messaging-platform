import { createStopHandler, SHUTDOWN_TIMEOUT_MS } from '@/serverLifecycle';

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
