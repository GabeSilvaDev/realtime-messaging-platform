// O cliente @elastic/elasticsearch só conversa com servidores do MESMO major: o 9.x manda
// "compatible-with=9", que o Elasticsearch 8 recusa com 400 (media_type_header_exception).
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../../..');

function major(version: string | undefined): string | undefined {
  return /^\D*(\d+)\./.exec(version ?? '')?.[1];
}

describe('versão do cliente Elasticsearch', () => {
  const composeImage = /elasticsearch\/elasticsearch:(\d+\.\d+\.\d+)/.exec(
    readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8')
  )?.[1];

  it('o docker-compose fixa a imagem do Elasticsearch', () => {
    expect(composeImage).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('a dependência declarada tem o mesmo major da imagem do docker-compose', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(major(pkg.dependencies['@elastic/elasticsearch'])).toBe(major(composeImage));
  });

  it('o pacote instalado tem o mesmo major da imagem do docker-compose', () => {
    const installed = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/@elastic/elasticsearch/package.json'), 'utf8')
    ) as { version: string };

    expect(major(installed.version)).toBe(major(composeImage));
  });
});
