import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SHARED_DIR = join(__dirname, '../../../../src/shared');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(fullPath);
    }
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('camadas — src/shared', () => {
  it('não deve importar nada de src/modules (shared é a base, módulos dependem dele)', () => {
    const offenders = listTsFiles(SHARED_DIR).filter((file) =>
      /from\s+['"](@\/modules\/|(\.\.\/)+modules\/)/.test(readFileSync(file, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});
