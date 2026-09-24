jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));

import { runReindex } from '@/modules/search/cli';

const RESULT = { scanned: 3, indexed: 2, deleted: 1, failed: 0 };

describe('runReindex (npm run search:reindex)', () => {
  let steps: string[];
  let indexer: { reindexAll: jest.Mock };
  let log: { info: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    steps = [];
    indexer = {
      reindexAll: jest.fn(async () => {
        steps.push('reindex');
        return RESULT;
      }),
    };
    log = { info: jest.fn(), error: jest.fn() };
  });

  function deps(argv: string[] = []): Parameters<typeof runReindex>[0] {
    return {
      argv,
      indexer,
      connect: async () => {
        steps.push('connect');
      },
      disconnect: async () => {
        steps.push('disconnect');
      },
      log,
    };
  }

  it('conecta, reindexa, loga o resumo, desconecta e sai com 0', async () => {
    await expect(runReindex(deps())).resolves.toBe(0);

    expect(steps).toEqual(['connect', 'reindex', 'disconnect']);
    expect(indexer.reindexAll).toHaveBeenCalledWith({ recreate: false });
    expect(log.info).toHaveBeenCalledWith('Reindexação da busca concluída', {
      ...RESULT,
      recreate: false,
    });
  });

  it('--recreate é repassado', async () => {
    await runReindex(deps(['--recreate']));

    expect(indexer.reindexAll).toHaveBeenCalledWith({ recreate: true });
  });

  it('itens com falha → código 1 (os detalhes já foram logados item a item)', async () => {
    indexer.reindexAll.mockResolvedValue({ ...RESULT, failed: 2 });

    await expect(runReindex(deps())).resolves.toBe(1);
  });

  it('erro (conexão, bulk) → loga, desconecta e sai com 1', async () => {
    const failure = new Error('connect ECONNREFUSED');
    indexer.reindexAll.mockRejectedValue(failure);

    await expect(runReindex(deps())).resolves.toBe(1);

    expect(log.error).toHaveBeenCalledWith('Falha na reindexação da busca', failure, {
      recreate: false,
    });
    expect(steps).toEqual(['connect', 'disconnect']);
  });

  it('falha ao desconectar também vira código 1; rejeição que não é Error vira Error', async () => {
    const failing = {
      ...deps(),
      disconnect: () => Promise.reject('socket hang up'),
    };

    await expect(runReindex(failing)).resolves.toBe(1);

    expect(log.error).toHaveBeenCalledWith(
      'Falha ao desconectar do MongoDB/Elasticsearch',
      new Error('socket hang up')
    );
  });
});
