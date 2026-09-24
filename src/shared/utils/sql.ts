/**
 * Escapa os caracteres especiais do LIKE/ILIKE (`\`, `%`, `_`) para que um termo de busca
 * livre não seja interpretado como padrão de wildcard do SQL.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
