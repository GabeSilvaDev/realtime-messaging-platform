import { logger } from '../logger';
import { cacheService } from './CacheService';
import { CACHE_CONSTANTS } from './cache.constants';
import type { ICacheService } from './cache.types';

/**
 * Invalidação em dois tempos contra o write-back obsoleto: uma leitura que começou ANTES da
 * mudança (cache vazio → consulta ao banco) pode terminar DEPOIS do DEL e gravar o valor antigo
 * por todo o TTL. `forget` apaga as chaves na hora (aguardado: quem publica o evento só termina
 * com o cache limpo) e agenda um segundo DEL `delayMs` depois (fire-and-forget, timer `unref`),
 * que apaga o que uma carga em voo tenha gravado nesse intervalo.
 *
 * Um novo `forget` da mesma chave reinicia o seu timer (nunca acumula timers por chave). Falha
 * no segundo DEL vira log `warn` (o `CacheService` já degrada sozinho; isto cobre outros `del`).
 * Janela residual: uma carga que demore mais que `delayMs` ainda pode gravar o valor antigo
 * (limitado pelo TTL).
 */
export class DelayedCacheInvalidator {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly cache: Pick<ICacheService, 'del'> = cacheService,
    private readonly delayMs: number = CACHE_CONSTANTS.DELAYED_DELETE_MS
  ) {}

  async forget(keys: string | string[]): Promise<void> {
    const list = [...new Set(Array.isArray(keys) ? keys : [keys])];
    if (list.length === 0) {
      return;
    }
    await this.cache.del(list);
    list.forEach((key) => {
      this.scheduleSecondDelete(key);
    });
  }

  /** Cancela os segundos DELs pendentes (encerramento e testes). */
  cancelPending(): void {
    this.timers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.timers.clear();
  }

  private scheduleSecondDelete(key: string): void {
    clearTimeout(this.timers.get(key));
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.cache.del(key).catch((error: unknown) => {
        logger.warn('Falha no segundo DEL do cache', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.delayMs);
    timer.unref();
    this.timers.set(key, timer);
  }
}
