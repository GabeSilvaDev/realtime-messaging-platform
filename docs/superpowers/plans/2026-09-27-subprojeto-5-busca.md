# Subprojeto 5 — Busca de Mensagens (Sprint 8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Busca full-text de mensagens (RF006) — indexação automática no Elasticsearch, relevância, destaque dos termos, filtros por conversa, autor e data, facetas por conversa, até 100 resultados por consulta, resposta < 300 ms e busca com e sem acentos — sempre restrita às conversas das quais o usuário participa no momento da busca.

**Architecture:** Novo módulo `src/modules/search`: `SearchIndexService` (índice `messages` com mapping `strict` e analyzer `pt_folded`, criado de forma idempotente no `bootstrap()`, indexação unitária e reindex em lotes via `bulk`), o `MessageIndexer` (subscribers `{ async: true }` de `chat:message-sent`/`chat:message-deleted`), o `SearchService` (conversas do usuário → consulta `bool` com `multi_match` + filtros → highlight e facetas → hidratação no MongoDB na ordem do Elasticsearch) e `GET /api/search/messages` com rate limit próprio. O chat ganha duas consultas por interface (`IMessageService.findByIdsForSearch` e `forEachForIndexing`); o Elasticsearch é acessado por uma interface mínima (`SearchClient`) que os testes substituem por um fake em memória. Recuperação por `npm run search:reindex [-- --recreate]`; cliente demo com campo de busca.

**Tech Stack:** Node 20, TypeScript 5.9 (strict), Express 5, `@elastic/elasticsearch` 8.19 (servidor Elasticsearch 8.17), Mongoose 9 (MongoDB 8), Sequelize 6 + PostgreSQL 17, Zod 4, Jest 30 + ts-jest + supertest.

**Spec:** `docs/superpowers/specs/2026-09-27-subprojeto-5-busca-design.md` (fonte da verdade) · convenções em `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` §2 · estilo do plano anterior: `docs/superpowers/plans/2026-09-26-subprojeto-4-presenca-cache.md`.

## Global Constraints

- Branch `feature/search` já existe (com o spec commitado) — não há passo de criação de branch. Confirme com `git branch --show-current` antes da Task 1.
- NUNCA criar, modificar ou sobrescrever `.env` (segredos reais). Overrides vão como variáveis na linha de comando. NUNCA `docker compose down -v` nem apagar volumes. NUNCA tocar containers/processos de outros projetos (as portas 3000/5432/6379 do host são deles). Todo processo iniciado tem o PID gravado e é encerrado por esse PID (nunca `pkill`/`pgrep -f` com padrão).
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (nunca `npx jest`: um hook reescreve e filtra a saída). `jest.config.ts` usa `roots: [src, tests]`, threshold global de 90% e a cobertura real é 100% — todo arquivo novo em `src/` é totalmente testado; manter 100% (statements, branches, functions, lines). A única exclusão nova é a entrada do comando de reindex (`src/scripts/reindexMessages.ts`, Task 10), que só liga conexões ao `runReindex` testado.
- A suíte não depende do `.env`: basta que as variáveis de banco estejam preenchidas (qualquer valor), como no CI. Sem `.env` carregado, prefixe os comandos jest/tsc com `NODE_ENV=test POSTGRES_USER=ci POSTGRES_PASSWORD=ci POSTGRES_DB=ci REDIS_PASSWORD=ci MONGO_USER=ci MONGO_PASSWORD=ci MONGO_DB=ci ELASTIC_PASSWORD=ci`.
- `jest.config.ts` tem `resetMocks`, `restoreMocks` e `clearMocks`: NUNCA colocar implementação de mock dentro de factory de `jest.mock` (nada de `jest.fn(() => ...)`/`mockReturnValue` na factory). Use funções simples ou objetos reais (ex.: `new FakeRedis()`, `new FakeSearchClient()`) na factory, ou configure `mockResolvedValue`/`mockImplementation` em `beforeEach`/no teste. `jest.fn()` sem implementação na factory é ok.
- `tests/setup.ts` não chama `initLogger` (só cria `Logger.getInstance`): mocke `@/shared/logger` ou chame `initLogger` num `beforeAll` onde código real usa o logger.
- **Nenhum teste toca um Elasticsearch ou um Redis de verdade.** O `elasticsearch` de `@/shared/database/elasticsearch` é um `Client` que aponta para o Elasticsearch da config (`ELASTICSEARCH_URL`); nenhum teste pode fazer requisição por ele. Todo teste que exercita a busca injeta o `FakeSearchClient` (`tests/support/elasticsearch/fakeSearchClient.ts`, Task 3 — ex.: `new SearchService({ client: fake.client, ... })`) ou mocka `@/shared/database/elasticsearch` (`{ elasticsearch: {} }` ou um `FakeSearchClient`). O Redis segue a regra do SP4: o `redis` de `@/shared/database/redis` aponta, sem `.env`, para `localhost:6379` — o Redis de OUTRO projeto nesta máquina —, então todo teste que carrega código com cache mocka `@/shared/database/redis` (`{ redis: {} }` ou um `FakeRedis`). A única exceção é `tests/integration/search/elasticsearch.int.test.ts` (Task 9), que só roda com `ELASTICSEARCH_IT_URL` definida (pulada no CI e na suíte normal). A Task 12 prova a regra rodando a suíte com o Redis e o Elasticsearch apontados para um contador de conexões (esperado: 0).
- Prettier é verificado no CI (`npm run format:check` cobre `src/**/*.ts` e `tests/**/*.ts`): rodar `node node_modules/.bin/prettier --write <arquivos>` antes de cada commit. ESLint `strictTypeChecked` em `src`: `node node_modules/.bin/eslint src` deve sair com código 0 (e sem warnings). `tsconfig.json` inclui `tests/**`: `node node_modules/.bin/tsc --noEmit` também checa os testes. ts-jest roda com `isolatedModules` (sem checagem de tipos): erros de tipo só aparecem no `tsc`.
- Commits: gitmoji + Conventional Commits em PT-BR, atômicos (um por task); NUNCA mencionar Claude/Anthropic/IA nem adicionar `Co-Authored-By`; NUNCA commitar `.github/SRS.md`, `*.stale-root/` nem `.env*` (exceto `.env.example`). Sempre `git add <arquivos explícitos>` (nunca `git add -A`/`git add .`).
- Validação com stack real usa portas alternativas: `POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301`; app no host com `PORT=3100` (confira antes que a porta está livre); `MONGODB_URL` montada em tempo de execução com as credenciais do `.env` passadas por `encodeURIComponent`, sem escrever arquivo algum; rodar as migrations primeiro. O container `rtm-app` não funciona — não usar.
- Comandos em background: nunca `cd <dir> && comando &` (o `&` leva o `cd` junto para um subshell e o resto da linha roda no diretório errado). Faça o `cd` num comando separado (ou use caminhos absolutos) e só então `comando &` + `echo $! > <arquivo>.pid`.
- Módulos só se consomem por interface exportada ou EventBus (roadmap §2.3), importando o ARQUIVO do service (ex.: `@/modules/chat/services/MessageService`) e os tipos/erros públicos (`@/modules/chat/{interfaces,types,errors}`), nunca o barrel do módulo nem repositório alheio. O `search` depende do `chat`; o `chat` não conhece o `search`. `src/shared` não importa `src/modules` (teste de camadas existente).
- Express 5: `req.query` é somente leitura. Fixtures de UUID v4 válidos (ex.: `11111111-1111-4111-8111-111111111111`); ids de mensagem são ObjectIds (24 hexadecimais).

## Decisões de design (ambiguidades do spec resolvidas)

1. **Cliente Elasticsearch 8.x (não 9.x).** O `package.json` traz `@elastic/elasticsearch@^9.2.0`, mas o docker-compose sobe o Elasticsearch **8.17**: o cliente 9 manda `compatible-with=9` e o servidor 8 recusa as requisições com corpo (`400 media_type_header_exception: Accept version must be either version 8 or 7, but found 9` — reproduzido na escrita do plano; só o `cluster.health` do bootstrap passava). A Task 2 troca para `@elastic/elasticsearch@^8.19.2` (mesma API do `new Client({ node, auth, tls })` de `src/shared/database/elasticsearch.ts`) e um teste amarra o major do pacote (declarado e instalado) ao major da imagem do docker-compose.
2. **Analyzer: a cadeia do spec não junta plural com acento.** Medido num Elasticsearch 8.17: com `lowercase → asciifolding → pt_stop → light_portuguese` (spec §2), "coração"/"coracao" viram `coraca` mas "CORAÇÕES"/"corações" viram `coraco` (e "reunião" × "reuniões", "ação" × "ações" idem) — o `light_portuguese` só reduz "-ões" a "-ão" com acento, e o acento já saiu. Solução: um filtro `pt_plural_oes` (`pattern_replace` `oes$` → `ao`) entre as stopwords e o stemmer. Resultado (17 grupos medidos): "coração", "coracao", "CORAÇÕES", "corações", "coracoes" → `coraca`; reunião/reuniões, ação/ações, avião/aviões, canção/canções, limão/limões, mãe/mães, mão/mãos, irmão/irmãos, mensagem/mensagens, viagem/viagens, café/cafés, você, amanhã, feliz/felizes batem; lacuna conhecida: plurais irregulares em "-ães" ("pães" × "pão"; um `aes$ → ao` quebraria "mães" × "mãe", mais comum). `content.exact` usa `pt_exact` (`lowercase` + `asciifolding`). Documentado nos READMEs e no SRS §7.4.
3. **`SearchClient` é uma interface própria, não um `Pick<Client, ...>`.** Os métodos do `Client` declaram `this: That` (com o `transport`): um objeto com só os métodos escolhidos não compila ao chamá-los (`The 'this' context of type ... is not assignable`). `SearchClient` (Task 2) declara só as assinaturas usadas (`indices.exists/create/delete`, `index`, `delete`, `bulk`, `search`) e o `Client` real a satisfaz (conferido com `tsc`).
4. **`listConversationIdsFor` já existe com outro nome.** `IConversationService.getUserConversationIds(userId)` (usado pelo realtime) devolve exatamente os ids das conversas das quais o usuário participa hoje (arquivadas inclusive). A busca o reutiliza em vez de criar um método duplicado; o chat ganha só os dois métodos de `IMessageService` (+ `findActiveByIds`/`findPageAfter` no repositório).
5. **Reindex percorre TODAS as mensagens.** `forEachForIndexing` entrega também as apagadas (`text: null`), que viram `delete` no `bulk`: é o que torna verdadeiro o "o próximo reindex o remove" do spec (documento "ressuscitado" pela corrida delete-antes-do-index, ou que ficou porque o `delete` falhou com o Elasticsearch fora). As não apagadas são indexadas (idempotente: mesmo `_id`). Contagem: `indexed`, `deleted` (só `status: 200`; 404 = já não estava lá), `failed` (item a item, cada um logado com o `messageId`). O comando sai com 1 se `failed > 0`. A lógica do comando (`runReindex`: argumentos, conexões, código de saída) fica em `src/modules/search/cli` (testada); só a entrada `src/scripts/reindexMessages.ts` sai da cobertura — pela negação em `collectCoverageFrom` do `jest.config.ts`, o mecanismo que o projeto já usa para as outras exclusões (`coveragePathIgnorePatterns` não é usado no projeto).
6. **Erros da API.** "404 `CONVERSATION_NOT_FOUND`" (spec §4) = a própria `ConversationNotFoundException` do chat (código `NOT_FOUND`, "Conversa não encontrada"): resposta idêntica à de uma conversa inexistente, sem oráculo. `SEARCH_UNAVAILABLE` entra no enum `ErrorCode` compartilhado (503). `InvalidSearchRangeException` é 400 `VALIDATION_ERROR`, lançada pelo `SearchService` antes de qualquer consulta (a regra vale para qualquer chamador, não só para o controller). Qualquer falha da chamada `search` ao Elasticsearch (conexão, timeout, índice ausente, 4xx) vira 503 com log `error` do erro original; falhas de Postgres/MongoDB seguem o 500 padrão.
7. **Consulta.** `multi_match` `most_fields` em `content` e `content.exact^2`; filtros em contexto de filtro (`terms conversationId` com as permitidas ∩ `conversationId`, `term senderId`, `range createdAt` com `gte`/`lte` só dos lados informados); `sort: [_score desc, createdAt desc]` (o `_score` continua vindo nos hits — conferido); `_source: false` (o texto vem do MongoDB; o highlight funciona mesmo assim — conferido); highlight `encoder: html`, `<mark>`/`</mark>`, 150 caracteres, até 3 fragmentos, pedido para `content` **e** `content.exact`: usa-se o de `content` e, se não houver, o de `content.exact` (uma consulta só de stopword, como "de", casa só pela forma exata). Facetas: `terms conversationId` (10). `total` = `hits.total.value` do Elasticsearch (pode contar um documento descartado na hidratação; documentado).
8. **`tookMs`** = tempo total do `searchMessages` no servidor (conversas no Postgres + Elasticsearch + hidratação no MongoDB), medido com `performance.now()` e arredondado — é o que o requisito "< 300 ms" pede; não é o `took` do Elasticsearch. Relógio injetável nos testes.
9. **Validação.** `q` com trim, 1–200; UUIDs normalizados em minúsculas; `from`/`to` em ISO 8601 **com fuso** (`Z` ou `±hh:mm`; data sem hora é recusada — sem ambiguidade de fuso), convertidos em `Date`; `limit` 1–100 (padrão 20). Mensagens de erro em PT-BR, no formato 400 do projeto (`sendValidationError`).
10. **Rate limit.** `authenticate` → limiter → controller (requisição sem token não consome a cota). `createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'rl:search:' })` (chave padrão = IP; Redis fora de `NODE_ENV=test`, `MemoryStore` nos testes), além do limite global de `/api`. `createSearchRoutes(controller?, limiter?)` existe para os testes montarem rotas com a contagem zerada; `searchRoutes` é a instância da aplicação.
11. **Índice no bootstrap.** `ensureIndex()` depois do `connectElasticsearch()` e antes de registrar o `MessageIndexer`: se o índice existe, não mexe; se outra instância o criou entre o `exists` e o `create`, o `resource_already_exists_exception` vale como sucesso. O Elasticsearch já é dependência dura do bootstrap.
12. **Conversa apagada.** Quando a conversa some, o chat apaga as mensagens dela do MongoDB, mas o índice não é limpo (nada no spec; `delete_by_query` ficaria fora do `SearchClient`): ninguém participa mais da conversa, então os documentos nunca voltam numa busca; o `--recreate` os elimina. Documentado como limitação.
13. **Fake do Elasticsearch.** `FakeSearchClient` registra as chamadas, guarda documentos por índice, reproduz as formas de resposta e de erro do 8.17 (conferidas: `resource_already_exists_exception`, `index_not_found_exception`, `strict_dynamic_mapping_exception`, `delete` 404 `not_found` e `{ ignore: [404] }`, erros item a item no `bulk` com `errors: true`, e `delete` ausente no `bulk` com `status: 404` sem `errors`) e avalia a consulta de forma simplificada (palavras inteiras sem acento/caixa, filtros, ordem, highlight escapado, agregação); `searchResponse` fixa uma resposta; `failWith` derruba tudo; `failingBulkIds` falha itens do `bulk`. A semântica real do analyzer fica com o teste de integração opcional (Task 9) e o smoke.
14. **Cliente demo.** Campo de busca no cabeçalho (visível depois do login) e lista de resultados no topo da barra lateral; o nome do autor vem só dos participantes das conversas já carregadas ("você"/"alguém" nos demais casos). `innerHTML` é usado **uma única vez**, no fragmento de highlight (texto escapado pelo Elasticsearch); o resto é `textContent` — um teste do `app.test.ts` conta as ocorrências de `.innerHTML =` em `app.js` (exatamente 1). Um `[hidden] { display: none !important; }` no CSS corrige de quebra os elementos com `hidden` cujo `display` vinha de uma regra por id (ex.: `#login-view`, que continuava visível depois do login). CSP intacta.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/chat/{types/message.types.ts,interfaces/IMessageRepository.ts,interfaces/IMessageService.ts,repositories/MessageRepository.ts,services/MessageService.ts}` | Modificar | `IndexableMessage`; `findActiveByIds`/`findPageAfter` no repositório; `findByIdsForSearch`/`forEachForIndexing` no service |
| `package.json`, `package-lock.json` | Modificar | `@elastic/elasticsearch@^8.19.2`; script `search:reindex` |
| `src/shared/types/error.types.ts` | Modificar | `ErrorCode.SEARCH_UNAVAILABLE` |
| `src/modules/search/constants/*` | Criar | Nome do índice (`ELASTICSEARCH_MESSAGES_INDEX`), settings/mapping, limites |
| `src/modules/search/{types,errors,validation,interfaces}/*` | Criar | `MessageDocument`, `SearchClient`, parâmetros e resultado; `SearchUnavailableException`, `InvalidSearchRangeException`; `searchMessagesQuerySchema`; `ISearchIndexService`, `ISearchService` |
| `src/modules/search/services/SearchIndexService.ts` | Criar | `ensureIndex`, `indexMessage`, `deleteMessage`, `reindexAll` |
| `src/modules/search/services/SearchService.ts` | Criar | `searchMessages` (autorização, consulta, hidratação, facetas, `tookMs`) |
| `src/modules/search/listeners/*` | Criar | `registerSearchIndexListeners` (MessageIndexer) |
| `src/modules/search/{controllers,routes}/*`, `src/modules/search/index.ts` | Criar | `SearchController`, `createSearchRoutes`/`createSearchRateLimiter`/`searchRoutes`, barrel |
| `src/modules/search/cli/*`, `src/scripts/reindexMessages.ts` | Criar | `runReindex` (testado) e a entrada do `npm run search:reindex` (fora da cobertura) |
| `src/app.ts`, `src/bootstrap.ts`, `jest.config.ts` | Modificar | Rota `/api/search`; `ensureIndex` + MessageIndexer no bootstrap; exclusão da entrada do reindex |
| `public/demo/{index.html,app.js,styles.css}` | Modificar | Campo de busca e resultados com highlight |
| `tests/support/chat/inMemoryChat.ts` | Modificar | `findActiveByIds`/`findPageAfter` em memória |
| `tests/support/elasticsearch/fakeSearchClient.ts` (+ teste de contrato) | Criar | Elasticsearch em memória |
| `tests/unit/**`, `tests/feature/modules/search/search.test.ts` | Criar/Modificar | Ver cada task |
| `tests/integration/search/elasticsearch.int.test.ts` | Criar | Integração opcional com Elasticsearch real (`ELASTICSEARCH_IT_URL`) |
| `README.md`, `README.pt-BR.md`, `.env.example` | Modificar | Seção Busca, rate limit, scripts, testes, estrutura, configuração, roadmap; `ELASTICSEARCH_MESSAGES_INDEX` |
| `.github/SRS.md` | Modificar (local, NÃO commitar) | Sprint 8 e §7.4 |

Comando de verificação usado ao fim de cada task (abreviado como **"verificação completa"**):

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: `tsc` e `eslint` sem erros (código 0), Prettier "All matched files use Prettier code style!", todas as suítes passando e o resumo com 100% em statements/branches/functions/lines.

---
### Task 1: Chat — consultas para a busca (hidratação por ids e varredura em lotes)

**Files:**
- Modify: `src/modules/chat/interfaces/IMessageRepository.ts`
- Modify: `src/modules/chat/interfaces/IMessageService.ts`
- Modify: `src/modules/chat/repositories/MessageRepository.ts`
- Modify: `src/modules/chat/services/MessageService.ts`
- Modify: `src/modules/chat/types/message.types.ts`
- Modify: `tests/support/chat/inMemoryChat.ts`
- Modify: `tests/unit/modules/chat/controllers/MessageController.test.ts`
- Modify: `tests/unit/modules/chat/repositories/MessageRepository.test.ts`
- Modify: `tests/unit/modules/chat/services/MessageService.test.ts`

**Interfaces:**
- Produces: `IndexableMessage` em `@/modules/chat/types` — `{ id: string; conversationId: string; senderId: string; text: string | null; createdAt: Date }` (`text: null` = apagada).
- Produces: `IMessageRepository.findActiveByIds(ids: string[]): Promise<MessageRecord[]>` (só não apagadas, qualquer ordem, ignora ids que não são ObjectId) e `findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]>` (apagadas inclusive, `_id` crescente).
- Produces: `IMessageService.findByIdsForSearch(ids: string[]): Promise<MessageDTO[]>` (sem checagem de participante; `[]` sem consultar o banco) e `forEachForIndexing(batchSize: number, handler: (batch: IndexableMessage[]) => Promise<void>): Promise<number>` (lote mínimo 1; devolve quantas percorreu; erro do handler propaga).
- Produces: `InMemoryMessageRepository.findActiveByIds/findPageAfter` (`tests/support/chat/inMemoryChat.ts`, usados pelo feature test da Task 8).

O chat expõe só o que a busca precisa, por interface (roadmap §2.3): a hidratação dos resultados (DTOs das mensagens não apagadas, na ordem que a busca quiser) e a varredura do reindex pelo cursor de `_id` — que entrega também as apagadas, com `text: null`, para o índice removê-las (decisão 5). O `limit(0)` do MongoDB significa "sem limite", por isso o lote mínimo é 1.

- [ ] **Step 1: Escrever os testes (falham hoje)**

Em `tests/unit/modules/chat/repositories/MessageRepository.test.ts`, substituir:

```ts
    });
  });
});
```

por:

```ts
    });
  });

  describe('findActiveByIds', () => {
    it('deve buscar só as não apagadas entre os ids informados', async () => {
      query.exec.mockResolvedValue([fakeDoc()]);

      const result = await repository.findActiveByIds([MESSAGE_ID, REPLY_ID]);

      expect(MockMessageModel.find).toHaveBeenCalledWith({
        _id: { $in: [MESSAGE_ID, REPLY_ID] },
        deletedAt: null,
      });
      expect(result).toEqual([expectedRecord]);
    });

    it('deve ignorar ids que não são ObjectId e não consultar sem ids válidos', async () => {
      query.exec.mockResolvedValue([]);

      await repository.findActiveByIds(['nao-e-objectid', MESSAGE_ID]);
      const result = await repository.findActiveByIds(['x', '']);

      expect(MockMessageModel.find).toHaveBeenCalledTimes(1);
      expect(MockMessageModel.find).toHaveBeenCalledWith({
        _id: { $in: [MESSAGE_ID] },
        deletedAt: null,
      });
      expect(result).toEqual([]);
    });
  });

  describe('findPageAfter', () => {
    it('sem cursor deve buscar desde o início, em ordem crescente de _id', async () => {
      query.exec.mockResolvedValue([fakeDoc({ deletedAt: STATUS_AT })]);

      const result = await repository.findPageAfter(null, 500);

      expect(MockMessageModel.find).toHaveBeenCalledWith({});
      expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(query.limit).toHaveBeenCalledWith(500);
      expect(result).toEqual([{ ...expectedRecord, deletedAt: STATUS_AT }]);
    });

    it('com cursor deve buscar só os _id maiores (apagadas inclusive)', async () => {
      query.exec.mockResolvedValue([]);

      await repository.findPageAfter(MESSAGE_ID, 2);

      const filter = MockMessageModel.find.mock.calls[0]![0] as { _id: { $gt: Types.ObjectId } };
      expect(filter._id.$gt.toString()).toBe(MESSAGE_ID);
      expect(query.limit).toHaveBeenCalledWith(2);
    });
  });
});
```

Em `tests/unit/modules/chat/services/MessageService.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
      markReadUpTo: jest.fn(),
      deleteByConversation: jest.fn(),
    };
    conversations = {
```

por:

```ts
      markReadUpTo: jest.fn(),
      deleteByConversation: jest.fn(),
      findActiveByIds: jest.fn(),
      findPageAfter: jest.fn(),
    };
    conversations = {
```

2. Substituir:

```ts
  });

  describe('cache de participantes (cache:conv:participants:<id>)', () => {
    beforeEach(() => {
```

por:

```ts
  });

  describe('findByIdsForSearch', () => {
    it('devolve os DTOs das não apagadas encontradas', async () => {
      messages.findActiveByIds.mockResolvedValue([record()]);

      const result = await service.findByIdsForSearch([MESSAGE_ID, REPLY_ID]);

      expect(messages.findActiveByIds).toHaveBeenCalledWith([MESSAGE_ID, REPLY_ID]);
      expect(result).toEqual([
        expect.objectContaining({
          id: MESSAGE_ID,
          content: { type: 'text', text: 'olá' },
          status: { sentAt: CREATED_AT, deliveredTo: [], readBy: [] },
        }),
      ]);
    });

    it('lista vazia não consulta o MongoDB', async () => {
      await expect(service.findByIdsForSearch([])).resolves.toEqual([]);
      expect(messages.findActiveByIds).not.toHaveBeenCalled();
    });
  });

  describe('forEachForIndexing', () => {
    const DELETED_AT = new Date('2026-09-24T11:00:00.000Z');

    it('percorre em lotes pelo cursor de _id até um lote incompleto', async () => {
      messages.findPageAfter
        .mockResolvedValueOnce([record({ id: 'a1' }), record({ id: 'a2' })])
        .mockResolvedValueOnce([record({ id: 'a3', deletedAt: DELETED_AT })]);
      const batches: unknown[] = [];

      const total = await service.forEachForIndexing(2, async (batch) => {
        batches.push(batch);
      });

      expect(total).toBe(3);
      expect(messages.findPageAfter.mock.calls).toEqual([
        [null, 2],
        ['a2', 2],
      ]);
      expect(batches).toEqual([
        [
          {
            id: 'a1',
            conversationId: CONVERSATION_ID,
            senderId: USER_A,
            text: 'olá',
            createdAt: CREATED_AT,
          },
          {
            id: 'a2',
            conversationId: CONVERSATION_ID,
            senderId: USER_A,
            text: 'olá',
            createdAt: CREATED_AT,
          },
        ],
        // Apagada vai com `text: null` (o índice remove o documento).
        [
          {
            id: 'a3',
            conversationId: CONVERSATION_ID,
            senderId: USER_A,
            text: null,
            createdAt: CREATED_AT,
          },
        ],
      ]);
    });

    it('lote cheio seguido de lote vazio encerra sem chamar o handler de novo', async () => {
      messages.findPageAfter
        .mockResolvedValueOnce([record({ id: 'b1' })])
        .mockResolvedValueOnce([]);
      const handler = jest.fn().mockResolvedValue(undefined);

      await expect(service.forEachForIndexing(1, handler)).resolves.toBe(1);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(messages.findPageAfter).toHaveBeenLastCalledWith('b1', 1);
    });

    it('tamanho de lote menor que 1 vira 1 (limit(0) no MongoDB traria tudo)', async () => {
      messages.findPageAfter.mockResolvedValue([]);

      await expect(service.forEachForIndexing(0, jest.fn())).resolves.toBe(0);

      expect(messages.findPageAfter).toHaveBeenCalledWith(null, 1);
    });

    it('erro do handler interrompe a varredura e propaga', async () => {
      messages.findPageAfter.mockResolvedValue([record({ id: 'c1' })]);

      await expect(
        service.forEachForIndexing(1, jest.fn().mockRejectedValue(new Error('es down')))
      ).rejects.toThrow('es down');
      expect(messages.findPageAfter).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache de participantes (cache:conv:participants:<id>)', () => {
    beforeEach(() => {
```

Em `tests/unit/modules/chat/controllers/MessageController.test.ts`, substituir:

```ts
    markDelivered: jest.fn(),
    markRead: jest.fn(),
  };
}
```

por:

```ts
    markDelivered: jest.fn(),
    markRead: jest.fn(),
    findByIdsForSearch: jest.fn(),
    forEachForIndexing: jest.fn(),
  };
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories/MessageRepository.test.ts tests/unit/modules/chat/services/MessageService.test.ts --coverage=false`

Expected: FAIL — 10 testes novos falham com `TypeError: repository.findActiveByIds is not a function` / `repository.findPageAfter is not a function` / `service.findByIdsForSearch is not a function` / `service.forEachForIndexing is not a function` (os demais passam).

- [ ] **Step 3: Implementar**

Em `src/modules/chat/types/message.types.ts`, substituir:

```ts
  nextCursor: string | null;
}
```

por:

```ts
  nextCursor: string | null;
}

/**
 * Mensagem como a busca a indexa (varredura do reindex). `text: null` = apagada (tombstone): o
 * índice remove o documento em vez de indexá-lo.
 */
export interface IndexableMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string | null;
  createdAt: Date;
}
```

Em `src/modules/chat/interfaces/IMessageRepository.ts`, substituir:

```ts
  /** Apaga todas as mensagens da conversa (usado quando a conversa é removida). */
  deleteByConversation(conversationId: string): Promise<number>;
}
```

por:

```ts
  /** Apaga todas as mensagens da conversa (usado quando a conversa é removida). */
  deleteByConversation(conversationId: string): Promise<number>;
  /**
   * Mensagens NÃO apagadas com esses ids, em qualquer ordem (hidratação da busca). Ids que não
   * são ObjectId são ignorados; sem nenhum id válido, não consulta o banco.
   */
  findActiveByIds(ids: string[]): Promise<MessageRecord[]>;
  /**
   * Até `limit` mensagens (apagadas inclusive) com `_id` maior que `afterId` (`null` = desde o
   * início), em ordem crescente de `_id` — a varredura em lotes do reindex da busca.
   */
  findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]>;
}
```

Em `src/modules/chat/interfaces/IMessageService.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import type {
  ListMessagesOptions,
  MessageDTO,
```

por:

```ts
import type {
  IndexableMessage,
  ListMessagesOptions,
  MessageDTO,
```

2. Substituir:

```ts
  /** Marca como lido tudo de outros autores até `messageId` e avança `last_read_at`. */
  markRead(userId: string, conversationId: string, messageId: string): Promise<void>;
}
```

por:

```ts
  /** Marca como lido tudo de outros autores até `messageId` e avança `last_read_at`. */
  markRead(userId: string, conversationId: string, messageId: string): Promise<void>;
  /**
   * DTOs das mensagens NÃO apagadas com esses ids, em qualquer ordem. Sem checagem de
   * participante: quem chama (a busca) já restringiu os ids às conversas do usuário.
   */
  findByIdsForSearch(ids: string[]): Promise<MessageDTO[]>;
  /**
   * Percorre TODAS as mensagens (apagadas com `text: null`) em lotes de `batchSize` (mínimo 1),
   * pelo cursor de `_id`, chamando `handler` a cada lote; devolve quantas percorreu. Um erro do
   * `handler` interrompe a varredura e propaga.
   */
  forEachForIndexing(
    batchSize: number,
    handler: (batch: IndexableMessage[]) => Promise<void>
  ): Promise<number>;
}
```

Em `src/modules/chat/repositories/MessageRepository.ts` (2 trechos, na ordem):

1. Substituir:

```ts
/** Código do MongoDB para violação de índice único. */
const DUPLICATE_KEY_ERROR_CODE = 11000;

function isDuplicateKeyError(error: unknown): boolean {
```

por:

```ts
/** Código do MongoDB para violação de índice único. */
const DUPLICATE_KEY_ERROR_CODE = 11000;

/** ObjectId em hexadecimal (24 caracteres). */
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function isDuplicateKeyError(error: unknown): boolean {
```

2. Substituir:

```ts
    return result.deletedCount;
  }
}
```

por:

```ts
    return result.deletedCount;
  }

  async findActiveByIds(ids: string[]): Promise<MessageRecord[]> {
    const validIds = ids.filter((id) => OBJECT_ID_PATTERN.test(id));
    if (validIds.length === 0) {
      return [];
    }
    const docs = await MessageModel.find({ _id: { $in: validIds }, deletedAt: null }).exec();
    return docs.map(toRecord);
  }

  async findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]> {
    const filter = afterId === null ? {} : { _id: { $gt: new Types.ObjectId(afterId) } };
    const docs = await MessageModel.find(filter).sort({ _id: 1 }).limit(limit).exec();
    return docs.map(toRecord);
  }
}
```

Em `src/modules/chat/services/MessageService.ts` (3 trechos, na ordem):

1. Substituir:

```ts
import { ParticipantDirectory } from './ParticipantDirectory';
import type {
  ListMessagesOptions,
  MessageCursor,
```

por:

```ts
import { ParticipantDirectory } from './ParticipantDirectory';
import type {
  IndexableMessage,
  ListMessagesOptions,
  MessageCursor,
```

2. Substituir:

```ts
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
```

por:

```ts
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Forma da mensagem para o índice de busca: apagada vai sem texto (o índice a remove). */
function toIndexable(record: MessageRecord): IndexableMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    text: record.deletedAt === null ? record.content.text : null,
    createdAt: record.createdAt,
  };
}
```

3. Substituir:

```ts
  }

  /** Mensagem inexistente ou de outra conversa → 404 (não revela mensagens alheias). */
  private async requireMessage(conversationId: string, messageId: string): Promise<MessageRecord> {
```

por:

```ts
  }

  async findByIdsForSearch(ids: string[]): Promise<MessageDTO[]> {
    if (ids.length === 0) {
      return [];
    }
    const records = await this.messages.findActiveByIds(ids);
    return records.map(toMessageDTO);
  }

  async forEachForIndexing(
    batchSize: number,
    handler: (batch: IndexableMessage[]) => Promise<void>
  ): Promise<number> {
    // limit(0) no MongoDB significa "sem limite": o lote mínimo é 1.
    const size = Math.max(1, Math.floor(batchSize));
    let afterId: string | null = null;
    let total = 0;
    for (;;) {
      const records = await this.messages.findPageAfter(afterId, size);
      if (records.length > 0) {
        await handler(records.map(toIndexable));
        total += records.length;
      }
      if (records.length < size) {
        return total;
      }
      afterId = records.reduce<string | null>((_last, record) => record.id, null);
    }
  }

  /** Mensagem inexistente ou de outra conversa → 404 (não revela mensagens alheias). */
  private async requireMessage(conversationId: string, messageId: string): Promise<MessageRecord> {
```

Em `tests/support/chat/inMemoryChat.ts`, substituir:

```ts
    return before - this.store.messages.length;
  }
}
```

por:

```ts
    return before - this.store.messages.length;
  }

  async findActiveByIds(ids: string[]): Promise<MessageRecord[]> {
    return this.store.messages.filter((m) => ids.includes(m.id) && m.deletedAt === null).map(copy);
  }

  /** Ids aleatórios em hexadecimal: a ordem de `id` é estável, como a de `_id` no MongoDB. */
  async findPageAfter(afterId: string | null, limit: number): Promise<MessageRecord[]> {
    return [...this.store.messages]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((m) => afterId === null || m.id > afterId)
      .slice(0, limit)
      .map(copy);
  }
}
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/chat --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/chat/interfaces/IMessageRepository.ts src/modules/chat/interfaces/IMessageService.ts src/modules/chat/repositories/MessageRepository.ts src/modules/chat/services/MessageService.ts src/modules/chat/types/message.types.ts tests/support/chat/inMemoryChat.ts tests/unit/modules/chat/controllers/MessageController.test.ts tests/unit/modules/chat/repositories/MessageRepository.test.ts tests/unit/modules/chat/services/MessageService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat/interfaces/IMessageRepository.ts \
  src/modules/chat/interfaces/IMessageService.ts \
  src/modules/chat/repositories/MessageRepository.ts \
  src/modules/chat/services/MessageService.ts \
  src/modules/chat/types/message.types.ts \
  tests/support/chat/inMemoryChat.ts \
  tests/unit/modules/chat/controllers/MessageController.test.ts \
  tests/unit/modules/chat/repositories/MessageRepository.test.ts \
  tests/unit/modules/chat/services/MessageService.test.ts
git commit -m "✨ feat: consultas do chat para a busca (hidratação por ids e varredura em lotes)"
```


---

### Task 2: Módulo `search` — base (cliente Elasticsearch 8, índice e analyzer, tipos, erros e validação)

**Files:**
- Modify: `package-lock.json` (gerado pelo `npm install`)
- Modify: `package.json`
- Create: `src/modules/search/constants/index.ts`
- Create: `src/modules/search/constants/search.constants.ts`
- Create: `src/modules/search/errors/index.ts`
- Create: `src/modules/search/errors/search.errors.ts`
- Create: `src/modules/search/types/index.ts`
- Create: `src/modules/search/types/search.types.ts`
- Create: `src/modules/search/validation/index.ts`
- Create: `src/modules/search/validation/search.schemas.ts`
- Modify: `src/shared/types/error.types.ts`
- Create: `tests/unit/modules/search/constants/search.constants.test.ts`
- Create: `tests/unit/modules/search/errors/search.errors.test.ts`
- Create: `tests/unit/modules/search/validation/search.schemas.test.ts`
- Create: `tests/unit/shared/database/elasticsearchVersion.test.ts`
- Modify: `tests/unit/shared/types/error.types.test.ts`

**Interfaces:**
- Produces: dependência `@elastic/elasticsearch@^8.19.2` (decisão 1).
- Produces: `ErrorCode.SEARCH_UNAVAILABLE = 'SEARCH_UNAVAILABLE'` (`@/shared/types`, reexportado por `@/shared/errors`).
- Produces (`@/modules/search/constants`): `DEFAULT_MESSAGES_INDEX = 'messages'`, `resolveMessagesIndex(env = process.env): string`, `SEARCH_CONSTANTS` (`MESSAGES_INDEX`, `MAX_LIMIT: 100`, `DEFAULT_LIMIT: 20`, `MAX_QUERY_LENGTH: 200`, `REINDEX_BATCH: 500`, `FRAGMENT_SIZE: 150`, `MAX_FRAGMENTS: 3`, `FACET_SIZE: 10`, `HIGHLIGHT_PRE_TAG: '<mark>'`, `HIGHLIGHT_POST_TAG: '</mark>'`, `RATE_LIMIT_WINDOW_MS: 60_000`, `RATE_LIMIT_MAX_REQUESTS: 30`, `RATE_LIMIT_KEY_PREFIX: 'rl:search:'`), `MESSAGES_INDEX_SETTINGS: estypes.IndicesIndexSettings`, `MESSAGES_INDEX_MAPPINGS: estypes.MappingTypeMapping`.
- Produces (`@/modules/search/types`): `MessageDocument { messageId; conversationId; senderId; content: string; createdAt: string /* ISO */ }`, `MessageSearchAggregations { conversations: { buckets: { key: string; doc_count: number }[] } }`, `SearchClient` (decisão 3: `indices.exists/create/delete`, `index`, `delete(params, options?)`, `bulk`, `search(params): Promise<estypes.SearchResponse<unknown, MessageSearchAggregations>>`), `SearchMessagesParams { q; conversationId?; senderId?; from?: Date; to?: Date; limit }`, `MessageSearchHit { message: MessageDTO; highlights: string[]; score: number }`, `ConversationFacet { conversationId; count }`, `MessageSearchResult { items; total; facets: { conversations }; tookMs }`, `ReindexOptions { recreate? }`, `ReindexResult { scanned; indexed; deleted; failed }`.
- Produces (`@/modules/search/errors`): `SearchUnavailableException` (503, `SEARCH_UNAVAILABLE`, "Busca indisponível no momento; tente novamente mais tarde") e `InvalidSearchRangeException` (400, `VALIDATION_ERROR`, 'Período inválido: "from" deve ser anterior ou igual a "to"').
- Produces (`@/modules/search/validation`): `searchMessagesQuerySchema` (saída compatível com `SearchMessagesParams`) e o tipo `SearchMessagesQuery`.

A base do módulo, sem I/O. O analyzer segue a decisão 2 (o `pt_plural_oes` é o que faz "corações" encontrar "coração"); o `SearchClient` segue a decisão 3. A troca do cliente para o major 8 vem primeiro, com um teste que impede o descompasso de voltar.

- [ ] **Step 1: Escrever os testes (falham hoje)**

Criar `tests/unit/shared/database/elasticsearchVersion.test.ts`:

```ts
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
```

Em `tests/unit/shared/types/error.types.test.ts`, substituir:

```ts
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });
```

por:

```ts
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCode.SEARCH_UNAVAILABLE).toBe('SEARCH_UNAVAILABLE');
    });
  });
```

Criar `tests/unit/modules/search/constants/search.constants.test.ts`:

```ts
import {
  DEFAULT_MESSAGES_INDEX,
  MESSAGES_INDEX_MAPPINGS,
  MESSAGES_INDEX_SETTINGS,
  SEARCH_CONSTANTS,
  resolveMessagesIndex,
} from '@/modules/search/constants';

describe('search constants', () => {
  it('limites da busca e do reindex (spec §4 e §5)', () => {
    expect(SEARCH_CONSTANTS).toEqual({
      MESSAGES_INDEX: expect.any(String),
      MAX_LIMIT: 100,
      DEFAULT_LIMIT: 20,
      MAX_QUERY_LENGTH: 200,
      REINDEX_BATCH: 500,
      FRAGMENT_SIZE: 150,
      MAX_FRAGMENTS: 3,
      FACET_SIZE: 10,
      HIGHLIGHT_PRE_TAG: '<mark>',
      HIGHLIGHT_POST_TAG: '</mark>',
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_MAX_REQUESTS: 30,
      RATE_LIMIT_KEY_PREFIX: 'rl:search:',
    });
  });

  describe('resolveMessagesIndex', () => {
    it('usa ELASTICSEARCH_MESSAGES_INDEX quando definido (aparando espaços)', () => {
      expect(resolveMessagesIndex({ ELASTICSEARCH_MESSAGES_INDEX: ' messages-v2 ' })).toBe(
        'messages-v2'
      );
    });

    it.each([{}, { ELASTICSEARCH_MESSAGES_INDEX: '' }, { ELASTICSEARCH_MESSAGES_INDEX: '   ' }])(
      'cai no padrão "messages" com %j',
      (env) => {
        expect(resolveMessagesIndex(env)).toBe(DEFAULT_MESSAGES_INDEX);
        expect(DEFAULT_MESSAGES_INDEX).toBe('messages');
      }
    );

    it('lê process.env por padrão (e o índice das constantes vem daí)', () => {
      expect(resolveMessagesIndex()).toBe(SEARCH_CONSTANTS.MESSAGES_INDEX);
    });
  });

  describe('definição do índice', () => {
    it('1 shard, 0 réplicas e o analyzer pt_folded (acentos dobrados antes do stemmer)', () => {
      expect(MESSAGES_INDEX_SETTINGS).toEqual({
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          filter: {
            pt_stop: { type: 'stop', stopwords: '_portuguese_' },
            pt_plural_oes: { type: 'pattern_replace', pattern: 'oes$', replacement: 'ao' },
            pt_stemmer: { type: 'stemmer', language: 'light_portuguese' },
          },
          analyzer: {
            pt_folded: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding', 'pt_stop', 'pt_plural_oes', 'pt_stemmer'],
            },
            pt_exact: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding'],
            },
          },
        },
      });
    });

    it('mapping strict com content (pt_folded) + content.exact (pt_exact)', () => {
      expect(MESSAGES_INDEX_MAPPINGS).toEqual({
        dynamic: 'strict',
        properties: {
          messageId: { type: 'keyword' },
          conversationId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          content: {
            type: 'text',
            analyzer: 'pt_folded',
            fields: { exact: { type: 'text', analyzer: 'pt_exact' } },
          },
          createdAt: { type: 'date' },
        },
      });
    });
  });
});
```

Criar `tests/unit/modules/search/errors/search.errors.test.ts`:

```ts
import { InvalidSearchRangeException, SearchUnavailableException } from '@/modules/search/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('search errors', () => {
  it.each([
    [
      new SearchUnavailableException(),
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SEARCH_UNAVAILABLE,
      'Busca indisponível no momento; tente novamente mais tarde',
    ],
    [
      new InvalidSearchRangeException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Período inválido: "from" deve ser anterior ou igual a "to"',
    ],
  ])('%p', (error, statusCode, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
  });

  it('aceitam mensagem customizada', () => {
    expect(new SearchUnavailableException('fora').message).toBe('fora');
    expect(new InvalidSearchRangeException('inválido').message).toBe('inválido');
  });
});
```

Criar `tests/unit/modules/search/validation/search.schemas.test.ts`:

```ts
import { searchMessagesQuerySchema } from '@/modules/search/validation';

const CONVERSATION = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const SENDER = '11111111-1111-4111-8111-111111111111';

function firstMessage(input: Record<string, unknown>): string | undefined {
  return searchMessagesQuerySchema.safeParse(input).error?.issues[0]?.message;
}

describe('searchMessagesQuerySchema', () => {
  it('só q: apara espaços e aplica o limite padrão de 20', () => {
    expect(searchMessagesQuerySchema.parse({ q: '  coração  ' })).toEqual({
      q: 'coração',
      limit: 20,
    });
  });

  it('todos os filtros: UUIDs em minúsculas, datas ISO 8601 viram Date, limit numérico', () => {
    expect(
      searchMessagesQuerySchema.parse({
        q: 'reunião',
        conversationId: CONVERSATION,
        senderId: SENDER,
        from: '2026-09-27T00:00:00Z',
        to: '2026-09-27T12:30:00-03:00',
        limit: '100',
      })
    ).toEqual({
      q: 'reunião',
      conversationId: CONVERSATION.toLowerCase(),
      senderId: SENDER,
      from: new Date('2026-09-27T00:00:00.000Z'),
      to: new Date('2026-09-27T15:30:00.000Z'),
      limit: 100,
    });
  });

  it.each([
    [{}, 'q é obrigatório'],
    [{ q: ['a', 'b'] }, 'q é obrigatório'],
    [{ q: '   ' }, 'q não pode estar vazio'],
    [{ q: 'a'.repeat(201) }, 'q deve ter no máximo 200 caracteres'],
    [{ q: 'a', conversationId: 'x' }, 'ID de conversa inválido'],
    [{ q: 'a', senderId: 'x' }, 'ID de usuário inválido'],
    [
      { q: 'a', from: '2026-09-27' },
      'from deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)',
    ],
    [{ q: 'a', to: 'ontem' }, 'to deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)'],
    [{ q: 'a', limit: '0' }, 'limit deve estar entre 1 e 100'],
    [{ q: 'a', limit: '101' }, 'limit deve estar entre 1 e 100'],
    [{ q: 'a', limit: '2.5' }, 'limit deve ser um número inteiro'],
    [{ q: 'a', limit: 'abc' }, 'limit deve ser um número inteiro'],
  ])('%j → "%s"', (input, message) => {
    expect(firstMessage(input)).toBe(message);
  });

  it('aceita exatamente 200 caracteres e limit 1', () => {
    expect(searchMessagesQuerySchema.parse({ q: 'a'.repeat(200), limit: '1' }).limit).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/shared/database/elasticsearchVersion.test.ts tests/unit/shared/types/error.types.test.ts tests/unit/modules/search --coverage=false`

Expected: FAIL — `elasticsearchVersion`: a dependência declarada e o pacote instalado falham com `Expected: "8"` / `Received: "9"`; `error.types`: `Expected: "SEARCH_UNAVAILABLE"` / `Received: undefined`; as três suítes do search falham ao carregar (`Could not locate module @/modules/search/constants` / `.../errors` / `.../validation`).

- [ ] **Step 3: Trocar o cliente para o major 8**

Run: `npm install @elastic/elasticsearch@^8.19.2`

Expected: `package.json` passa a ter `"@elastic/elasticsearch": "^8.19.2",` (no lugar de `"^9.2.0"`) e o `package-lock.json` é atualizado (o `@elastic/transport` desce junto para o 8.x). Nenhum código muda: `src/shared/database/elasticsearch.ts` usa só `new Client({ node, auth, tls })`, `cluster.health` e `close`, iguais no 8.x.

- [ ] **Step 4: Implementar**

Em `src/shared/types/error.types.ts`, substituir:

```ts
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
```

por:

```ts
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SEARCH_UNAVAILABLE = 'SEARCH_UNAVAILABLE',

  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
```

Criar `src/modules/search/constants/search.constants.ts`:

```ts
import type { estypes } from '@elastic/elasticsearch';

/** Nome padrão do índice de mensagens (sobrescrito por `ELASTICSEARCH_MESSAGES_INDEX`). */
export const DEFAULT_MESSAGES_INDEX = 'messages';

/** `ELASTICSEARCH_MESSAGES_INDEX` (aparado) ou `messages` quando ausente/vazio. */
export function resolveMessagesIndex(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.ELASTICSEARCH_MESSAGES_INDEX?.trim() ?? '';
  return configured === '' ? DEFAULT_MESSAGES_INDEX : configured;
}

export const SEARCH_CONSTANTS = {
  /** Índice das mensagens, lido do ambiente na carga do módulo. */
  MESSAGES_INDEX: resolveMessagesIndex(),
  /** RF006.2: no máximo 100 resultados por consulta. */
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
  /** Tamanho máximo de `q` (após o trim). */
  MAX_QUERY_LENGTH: 200,
  /** Mensagens por lote no reindex (`bulk`). */
  REINDEX_BATCH: 500,
  /** Highlight: fragmentos de até 150 caracteres, no máximo 3 por mensagem. */
  FRAGMENT_SIZE: 150,
  MAX_FRAGMENTS: 3,
  /** Facetas: as 10 conversas com mais acertos. */
  FACET_SIZE: 10,
  HIGHLIGHT_PRE_TAG: '<mark>',
  HIGHLIGHT_POST_TAG: '</mark>',
  /** Rate limit próprio de `GET /api/search/messages`: 30 requisições por minuto por IP. */
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 30,
  RATE_LIMIT_KEY_PREFIX: 'rl:search:',
} as const;

/**
 * Analyzer `pt_folded` (indexação e consulta): minúsculas → sem acentos → stopwords do português
 * → plural nasal `-oes` vira `-ao` → stemmer leve do português. O `pt_plural_oes` existe porque o
 * `light_portuguese` só reduz "-ões" a "-ão" COM acento: depois do `asciifolding`, "corações" e
 * "coração" virariam radicais diferentes ("coraco" × "coraca"). `pt_exact` (sem stopwords nem
 * stemmer) alimenta `content.exact`, que pesa mais na relevância (forma exata da palavra).
 *
 * 1 shard e 0 réplicas servem ao ambiente de desenvolvimento (um nó); em produção, defina as
 * réplicas conforme o cluster (`PUT /messages/_settings`).
 */
export const MESSAGES_INDEX_SETTINGS: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    filter: {
      pt_stop: { type: 'stop', stopwords: '_portuguese_' },
      pt_plural_oes: { type: 'pattern_replace', pattern: 'oes$', replacement: 'ao' },
      pt_stemmer: { type: 'stemmer', language: 'light_portuguese' },
    },
    analyzer: {
      pt_folded: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'pt_stop', 'pt_plural_oes', 'pt_stemmer'],
      },
      pt_exact: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding'],
      },
    },
  },
};

/** Mapping `strict`: um campo fora desta lista faz a indexação falhar (nada entra por engano). */
export const MESSAGES_INDEX_MAPPINGS: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    messageId: { type: 'keyword' },
    conversationId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    content: {
      type: 'text',
      analyzer: 'pt_folded',
      fields: { exact: { type: 'text', analyzer: 'pt_exact' } },
    },
    createdAt: { type: 'date' },
  },
};
```

Criar `src/modules/search/constants/index.ts`:

```ts
export {
  DEFAULT_MESSAGES_INDEX,
  MESSAGES_INDEX_MAPPINGS,
  MESSAGES_INDEX_SETTINGS,
  SEARCH_CONSTANTS,
  resolveMessagesIndex,
} from './search.constants';
```

Criar `src/modules/search/errors/search.errors.ts`:

```ts
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

/** O Elasticsearch não respondeu (ou recusou a consulta): só a busca fica indisponível. */
export class SearchUnavailableException extends AppError {
  constructor(message = 'Busca indisponível no momento; tente novamente mais tarde') {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SEARCH_UNAVAILABLE);
  }
}

/** `from` posterior a `to`. */
export class InvalidSearchRangeException extends AppError {
  constructor(message = 'Período inválido: "from" deve ser anterior ou igual a "to"') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}
```

Criar `src/modules/search/errors/index.ts`:

```ts
export { InvalidSearchRangeException, SearchUnavailableException } from './search.errors';
```

Criar `src/modules/search/types/search.types.ts`:

```ts
import type { estypes, TransportRequestOptions } from '@elastic/elasticsearch';
import type { MessageDTO } from '@/modules/chat/types';

/** Documento do índice de mensagens (`_id` = `messageId`). Apagadas não ficam no índice. */
export interface MessageDocument {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  /** ISO 8601. */
  createdAt: string;
}

/** Agregações pedidas pela busca (facetas por conversa). */
export interface MessageSearchAggregations {
  conversations: { buckets: { key: string; doc_count: number }[] };
}

/**
 * A parte do cliente `@elastic/elasticsearch` que a busca usa. O `Client` real satisfaz esta
 * interface (não é um `Pick<Client, ...>`: os métodos do `Client` declaram `this` com o
 * `transport`, e um objeto só com os métodos não poderia chamá-los). Os testes injetam o
 * `FakeSearchClient` (`tests/support/elasticsearch`).
 */
export interface SearchClient {
  indices: {
    exists(params: estypes.IndicesExistsRequest): Promise<boolean>;
    create(params: estypes.IndicesCreateRequest): Promise<estypes.IndicesCreateResponse>;
    delete(params: estypes.IndicesDeleteRequest): Promise<estypes.IndicesDeleteResponse>;
  };
  index(params: estypes.IndexRequest<MessageDocument>): Promise<estypes.IndexResponse>;
  delete(
    params: estypes.DeleteRequest,
    options?: TransportRequestOptions
  ): Promise<estypes.DeleteResponse>;
  bulk(params: estypes.BulkRequest<MessageDocument>): Promise<estypes.BulkResponse>;
  search(
    params: estypes.SearchRequest
  ): Promise<estypes.SearchResponse<unknown, MessageSearchAggregations>>;
}

/** Parâmetros já validados de `GET /api/search/messages`. */
export interface SearchMessagesParams {
  q: string;
  conversationId?: string;
  senderId?: string;
  from?: Date;
  to?: Date;
  limit: number;
}

export interface MessageSearchHit {
  message: MessageDTO;
  /** Fragmentos com `<mark>…</mark>`; o texto do usuário vem escapado para HTML. */
  highlights: string[];
  score: number;
}

export interface ConversationFacet {
  conversationId: string;
  count: number;
}

export interface MessageSearchResult {
  items: MessageSearchHit[];
  /** Acertos no Elasticsearch (limitado a 10 000 pelo `track_total_hits` padrão). */
  total: number;
  facets: { conversations: ConversationFacet[] };
  /** Tempo total da busca no servidor (conversas + Elasticsearch + hidratação), em ms. */
  tookMs: number;
}

export interface ReindexOptions {
  /** Apaga e recria o índice antes (mudança de mapping/analyzer). */
  recreate?: boolean;
}

export interface ReindexResult {
  /** Mensagens percorridas no MongoDB (apagadas inclusive). */
  scanned: number;
  indexed: number;
  /** Apagadas removidas do índice (as que já não estavam lá não contam). */
  deleted: number;
  /** Itens do `bulk` que falharam (cada um logado com o `messageId`). */
  failed: number;
}
```

Criar `src/modules/search/types/index.ts`:

```ts
export type {
  ConversationFacet,
  MessageDocument,
  MessageSearchAggregations,
  MessageSearchHit,
  MessageSearchResult,
  ReindexOptions,
  ReindexResult,
  SearchClient,
  SearchMessagesParams,
} from './search.types';
```

Criar `src/modules/search/validation/search.schemas.ts`:

```ts
import { z } from 'zod';
import { SEARCH_CONSTANTS } from '../constants';

/** UUID normalizado em minúsculas (como os ids gravados no índice). */
const uuid = (message: string): z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>> =>
  z.uuid({ message }).transform((value) => value.toLowerCase());

/** Data ISO 8601 com fuso (`Z` ou `±hh:mm`), convertida em `Date`. */
const isoDateTime = (field: string): z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>> =>
  z.iso
    .datetime({
      offset: true,
      message: `${field} deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)`,
    })
    .transform((value) => new Date(value));

const limitMessage = `limit deve estar entre 1 e ${String(SEARCH_CONSTANTS.MAX_LIMIT)}`;

/** `GET /api/search/messages` (a regra `from ≤ to` fica no service). */
export const searchMessagesQuerySchema = z.object({
  q: z
    .string({ message: 'q é obrigatório' })
    .trim()
    .min(1, 'q não pode estar vazio')
    .max(
      SEARCH_CONSTANTS.MAX_QUERY_LENGTH,
      `q deve ter no máximo ${String(SEARCH_CONSTANTS.MAX_QUERY_LENGTH)} caracteres`
    ),
  conversationId: uuid('ID de conversa inválido').optional(),
  senderId: uuid('ID de usuário inválido').optional(),
  from: isoDateTime('from').optional(),
  to: isoDateTime('to').optional(),
  limit: z.coerce
    .number({ message: 'limit deve ser um número inteiro' })
    .int('limit deve ser um número inteiro')
    .min(1, limitMessage)
    .max(SEARCH_CONSTANTS.MAX_LIMIT, limitMessage)
    .optional()
    .default(SEARCH_CONSTANTS.DEFAULT_LIMIT),
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
```

Criar `src/modules/search/validation/index.ts`:

```ts
export { searchMessagesQuerySchema, type SearchMessagesQuery } from './search.schemas';
```

- [ ] **Step 5: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/shared/database/elasticsearchVersion.test.ts tests/unit/shared/types/error.types.test.ts tests/unit/modules/search --coverage=false`

Expected: PASS.

- [ ] **Step 6: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/search/constants/index.ts src/modules/search/constants/search.constants.ts src/modules/search/errors/index.ts src/modules/search/errors/search.errors.ts src/modules/search/types/index.ts src/modules/search/types/search.types.ts src/modules/search/validation/index.ts src/modules/search/validation/search.schemas.ts src/shared/types/error.types.ts tests/unit/modules/search/constants/search.constants.test.ts tests/unit/modules/search/errors/search.errors.test.ts tests/unit/modules/search/validation/search.schemas.test.ts tests/unit/shared/database/elasticsearchVersion.test.ts tests/unit/shared/types/error.types.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 7: Commit**

```bash
git add package.json \
  src/modules/search/constants/index.ts \
  src/modules/search/constants/search.constants.ts \
  src/modules/search/errors/index.ts \
  src/modules/search/errors/search.errors.ts \
  src/modules/search/types/index.ts \
  src/modules/search/types/search.types.ts \
  src/modules/search/validation/index.ts \
  src/modules/search/validation/search.schemas.ts \
  src/shared/types/error.types.ts \
  tests/unit/modules/search/constants/search.constants.test.ts \
  tests/unit/modules/search/errors/search.errors.test.ts \
  tests/unit/modules/search/validation/search.schemas.test.ts \
  tests/unit/shared/database/elasticsearchVersion.test.ts \
  tests/unit/shared/types/error.types.test.ts \
  package-lock.json
git commit -m "✨ feat: base do módulo search e cliente Elasticsearch 8 compatível com o servidor 8.17"
```


---

### Task 3: `FakeSearchClient` — Elasticsearch em memória para os testes

**Files:**
- Create: `tests/support/elasticsearch/fakeSearchClient.test.ts`
- Create: `tests/support/elasticsearch/fakeSearchClient.ts`

**Interfaces:**
- Consumes: `MessageDocument`, `SearchClient` (Task 2).
- Produces: `tests/support/elasticsearch/fakeSearchClient.ts` exporta `class FakeSearchClient` com `indices.exists/create/delete`, `index`, `delete(params, options?)`, `bulk`, `search`, além de `client: SearchClient` (o próprio fake), `calls: FakeCall[]`, `callsOf(method)`, `documents(index)`, `hasIndex(index)`, `reset()`, `failWith: Error | null`, `searchResponse` (resposta fixa da `search`) e `failingBulkIds: Set<string>`; e `class FakeResponseError` (`name = 'ResponseError'`, `meta: { statusCode, body }`), com o mesmo formato que o código inspeciona no `ResponseError` do cliente.

Não é arquivo de teste (não casa com `testMatch`); o contrato fica num teste ao lado dele. As formas de resposta e de erro são as do Elasticsearch 8.17 (decisão 13); a `search` é uma avaliação simplificada, suficiente para os testes de ponta a ponta — o analyzer real é provado na Task 9 e no smoke.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/support/elasticsearch/fakeSearchClient.test.ts`:

```ts
// Contrato do FakeSearchClient: as formas de resposta e de erro que o Elasticsearch 8.17 devolve
// para as chamadas usadas pela busca (conferidas contra um servidor real na escrita do plano) e a
// avaliação simplificada da `search` (sem analyzer — ver o cabeçalho do fake).
import type { estypes } from '@elastic/elasticsearch';
import type { MessageDocument } from '@/modules/search/types';
import { FakeResponseError, FakeSearchClient } from './fakeSearchClient';

const INDEX = 'messages';

function doc(overrides: Partial<MessageDocument> = {}): MessageDocument {
  return {
    messageId: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'Meu coração está feliz',
    createdAt: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}

function query(q: string, filter: estypes.QueryDslQueryContainer[] = []): estypes.SearchRequest {
  return {
    index: INDEX,
    size: 20,
    query: { bool: { must: [{ multi_match: { query: q } }], filter } },
    highlight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fields: { content: {} } },
    aggs: { conversations: { terms: { field: 'conversationId', size: 10 } } },
  };
}

describe('FakeSearchClient', () => {
  let fake: FakeSearchClient;

  beforeEach(() => {
    fake = new FakeSearchClient();
  });

  describe('índices', () => {
    it('exists/create/delete como no Elasticsearch', async () => {
      expect(await fake.indices.exists({ index: INDEX })).toBe(false);
      expect(await fake.indices.create({ index: INDEX })).toEqual({
        acknowledged: true,
        shards_acknowledged: true,
        index: INDEX,
      });
      expect(await fake.indices.exists({ index: INDEX })).toBe(true);
      expect(await fake.indices.delete({ index: INDEX })).toEqual({ acknowledged: true });
      expect(fake.hasIndex(INDEX)).toBe(false);
    });

    it('criar de novo → 400 resource_already_exists_exception', async () => {
      await fake.indices.create({ index: INDEX });

      const error = (await fake.indices.create({ index: INDEX }).catch((e: unknown) => e)) as
        | FakeResponseError
        | undefined;

      expect(error).toBeInstanceOf(FakeResponseError);
      expect(error?.name).toBe('ResponseError');
      expect(error?.meta.statusCode).toBe(400);
      expect(error?.meta.body.error?.type).toBe('resource_already_exists_exception');
    });

    it('apagar inexistente → 404 index_not_found_exception, salvo com ignore_unavailable', async () => {
      await expect(fake.indices.delete({ index: INDEX })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception' } } },
      });
      await expect(
        fake.indices.delete({ index: INDEX, ignore_unavailable: true })
      ).resolves.toEqual({ acknowledged: true });
    });
  });

  describe('index/delete', () => {
    it('index cria (e o índice, se faltar) e depois atualiza', async () => {
      expect(await fake.index({ index: INDEX, id: 'm1', document: doc() })).toEqual({
        _index: INDEX,
        _id: 'm1',
        result: 'created',
      });
      expect(
        await fake.index({ index: INDEX, id: 'm1', document: doc({ content: 'outro' }) })
      ).toMatchObject({ result: 'updated' });
      expect(fake.documents(INDEX)).toEqual([doc({ content: 'outro' })]);
    });

    it('campo fora do mapping → 400 strict_dynamic_mapping_exception', async () => {
      const document = { ...doc(), extra: true } as unknown as MessageDocument;

      await expect(fake.index({ index: INDEX, id: 'm1', document })).rejects.toMatchObject({
        meta: { statusCode: 400, body: { error: { type: 'strict_dynamic_mapping_exception' } } },
      });
    });

    it('delete: deleted; ausente → 404 not_found, ou resposta normal com ignore [404]', async () => {
      await fake.index({ index: INDEX, id: 'm1', document: doc() });

      expect(await fake.delete({ index: INDEX, id: 'm1' })).toEqual({
        _index: INDEX,
        _id: 'm1',
        result: 'deleted',
      });
      await expect(fake.delete({ index: INDEX, id: 'm1' })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { result: 'not_found' } },
      });
      expect(await fake.delete({ index: INDEX, id: 'm1' }, { ignore: [404] })).toMatchObject({
        result: 'not_found',
      });
      expect(fake.callsOf('delete')[2]).toEqual({
        method: 'delete',
        params: { index: INDEX, id: 'm1' },
        options: { ignore: [404] },
      });
    });
  });

  describe('bulk', () => {
    it('index e delete item a item; delete ausente é 404 sem erro (errors: false)', async () => {
      await fake.index({ index: INDEX, id: 'old', document: doc({ messageId: 'old' }) });

      const response = await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          doc(),
          { index: { _index: INDEX, _id: 'old' } },
          doc({ messageId: 'old' }),
          { delete: { _index: INDEX, _id: 'gone' } },
        ],
      });

      expect(response).toEqual({
        took: 1,
        errors: false,
        items: [
          { index: { _index: INDEX, _id: 'm1', status: 201, result: 'created' } },
          { index: { _index: INDEX, _id: 'old', status: 200, result: 'updated' } },
          { delete: { _index: INDEX, _id: 'gone', status: 404, result: 'not_found' } },
        ],
      });
    });

    it('erro item a item (strict e failingBulkIds) → errors: true e os demais seguem', async () => {
      fake.failingBulkIds.add('m2');
      await fake.index({ index: INDEX, id: 'm3', document: doc({ messageId: 'm3' }) });

      const response = await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          { ...doc(), extra: 1 } as unknown as MessageDocument,
          { index: { _index: INDEX, _id: 'm2' } },
          doc({ messageId: 'm2' }),
          { delete: { _index: INDEX, _id: 'm3' } },
        ],
      });

      expect(response.errors).toBe(true);
      expect(response.items).toEqual([
        {
          index: expect.objectContaining({
            _id: 'm1',
            status: 400,
            error: expect.objectContaining({ type: 'strict_dynamic_mapping_exception' }),
          }),
        },
        {
          index: {
            _index: INDEX,
            _id: 'm2',
            status: 429,
            error: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
          },
        },
        { delete: { _index: INDEX, _id: 'm3', status: 200, result: 'deleted' } },
      ]);
      expect(fake.documents(INDEX)).toEqual([]);
    });

    it('sem operações', async () => {
      await expect(fake.bulk({})).resolves.toEqual({ took: 1, errors: false, items: [] });
    });
  });

  describe('search (avaliação simplificada)', () => {
    beforeEach(async () => {
      await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          doc(),
          { index: { _index: INDEX, _id: 'm2' } },
          doc({
            messageId: 'm2',
            conversationId: 'c2',
            senderId: 'u2',
            content: 'coracao <b>sem</b> acento & coração',
            createdAt: '2026-09-27T11:00:00.000Z',
          }),
          { index: { _index: INDEX, _id: 'm3' } },
          doc({
            messageId: 'm3',
            conversationId: 'c2',
            content: 'CORAÇÃO',
            createdAt: '2026-09-27T12:00:00.000Z',
          }),
          { index: { _index: INDEX, _id: 'm4' } },
          doc({ messageId: 'm4', content: 'nada a ver', createdAt: '2026-09-27T13:00:00.000Z' }),
        ],
      });
    });

    it('palavra sem acento/caixa; relevância e depois createdAt desc; highlight escapado; facetas', async () => {
      const response = await fake.search(query('Coração'));

      expect(response.hits.total).toEqual({ value: 3, relation: 'eq' });
      expect(response.hits.max_score).toBe(2);
      expect(response.hits.hits.map((hit) => [hit._id, hit._score])).toEqual([
        ['m2', 2],
        ['m3', 1],
        ['m1', 1],
      ]);
      expect(response.hits.hits[0]?.highlight).toEqual({
        content: [
          '<mark>coracao</mark> &lt;b&gt;sem&lt;&#x2F;b&gt; acento &amp; <mark>coração</mark>',
        ],
      });
      expect(response.aggregations).toEqual({
        conversations: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [
            { key: 'c2', doc_count: 2 },
            { key: 'c1', doc_count: 1 },
          ],
        },
      });
    });

    it('filtros terms/term/range e size', async () => {
      const filtered = await fake.search(
        query('coração', [
          { terms: { conversationId: ['c1', 'c2'] } },
          { term: { senderId: 'u1' } },
          {
            range: {
              createdAt: { gte: '2026-09-27T10:30:00.000Z', lte: '2026-09-27T12:00:00.000Z' },
            },
          },
        ])
      );
      const onlyFrom = await fake.search(
        query('coração', [{ range: { createdAt: { gte: '2026-09-27T11:30:00.000Z' } } }])
      );
      const onlyTo = await fake.search(
        query('coração', [{ range: { createdAt: { lte: '2026-09-27T10:00:00.000Z' } } }])
      );
      const small = await fake.search({ ...query('coração'), size: 1 });

      expect(filtered.hits.hits.map((hit) => hit._id)).toEqual(['m3']);
      expect(onlyFrom.hits.hits.map((hit) => hit._id)).toEqual(['m3']);
      expect(onlyTo.hits.hits.map((hit) => hit._id)).toEqual(['m1']);
      expect(small.hits.hits).toHaveLength(1);
      expect(small.hits.total).toEqual({ value: 3, relation: 'eq' });
    });

    it('sem acerto: lista vazia, max_score null; size padrão 10', async () => {
      const { size: _size, ...withoutSize } = query('inexistente');
      const response = await fake.search(withoutSize);

      expect(response.hits).toEqual({
        total: { value: 0, relation: 'eq' },
        max_score: null,
        hits: [],
      });
    });

    it('facetas limitadas ao size da agregação', async () => {
      const request = query('coração');
      request.aggs = { conversations: { terms: { field: 'conversationId', size: 1 } } };

      const response = await fake.search(request);

      expect(
        (response.aggregations as { conversations: { buckets: unknown[] } }).conversations.buckets
      ).toEqual([{ key: 'c2', doc_count: 2 }]);
    });

    it('índice inexistente → 404 index_not_found_exception', async () => {
      await expect(fake.search({ ...query('x'), index: 'outro' })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception' } } },
      });
    });

    it('searchResponse sobrepõe a avaliação', async () => {
      const configured = {
        took: 7,
        timed_out: false,
        _shards: { total: 1, successful: 1, failed: 0 },
        hits: { hits: [] },
      };
      fake.searchResponse = configured;

      await expect(fake.search(query('coração'))).resolves.toBe(configured);
    });

    it('sem pre/post tags usa <em>', async () => {
      const response = await fake.search({
        ...query('coração'),
        highlight: { pre_tags: [], post_tags: [], fields: { content: {} } },
      });

      expect(response.hits.hits[2]?.highlight?.content).toEqual([
        'Meu <em>coração</em> está feliz',
      ]);
    });
  });

  describe('falha, registro e reset', () => {
    it('failWith faz toda chamada rejeitar (e ainda assim registra)', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(fake.indices.exists({ index: INDEX })).rejects.toThrow('ECONNREFUSED');
      await expect(fake.search(query('x'))).rejects.toThrow('ECONNREFUSED');
      expect(fake.calls.map((call) => call.method)).toEqual(['indices.exists', 'search']);
    });

    it('client é o próprio fake; reset limpa tudo', async () => {
      await fake.client.index({ index: INDEX, id: 'm1', document: doc() });
      fake.failingBulkIds.add('x');
      fake.searchResponse = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, failed: 0 },
        hits: { hits: [] },
      };

      fake.reset();

      expect(fake.client).toBe(fake);
      expect(fake.calls).toEqual([]);
      expect(fake.hasIndex(INDEX)).toBe(false);
      expect(fake.documents(INDEX)).toEqual([]);
      expect(fake.failingBulkIds.size).toBe(0);
      expect(fake.searchResponse).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/support/elasticsearch --coverage=false`

Expected: FAIL — `Cannot find module './fakeSearchClient' from 'tests/support/elasticsearch/fakeSearchClient.test.ts'`.

- [ ] **Step 3: Implementar**

Criar `tests/support/elasticsearch/fakeSearchClient.ts`:

```ts
// Elasticsearch em memória para os testes da busca. Não é arquivo de teste (não casa com
// testMatch). Implementa SÓ as chamadas que a busca usa (`indices.exists/create/delete`, `index`,
// `delete`, `bulk`, `search`), com as mesmas formas de resposta e de erro do Elasticsearch 8.17
// (conferidas contra um servidor real na escrita do plano): `resource_already_exists_exception`
// (400) ao recriar o índice, `index_not_found_exception` (404), `strict_dynamic_mapping_exception`
// (400) para campo fora do mapping, `delete` de documento ausente com `result: 'not_found'` (404,
// ou resposta normal com `{ ignore: [404] }`) e, no `bulk`, erro item a item.
//
// A `search` NÃO reproduz o analyzer: casa palavras inteiras sem acento e sem caixa (sem stemmer),
// ordena por número de palavras encontradas e depois `createdAt` desc, aplica os filtros `terms`/
// `term`/`range` e devolve highlight/agregação no formato do Elasticsearch. A semântica real do
// analyzer (stemmer, plural, stopwords) é provada no teste de integração opcional e no smoke.
// Para controlar a resposta, preencha `searchResponse`.
import type { estypes } from '@elastic/elasticsearch';
import type { MessageDocument, SearchClient } from '@/modules/search/types';

export interface FakeCall {
  method: string;
  params: unknown;
  options?: unknown;
}

interface ErrorBody {
  error?: { type: string; reason: string };
  [key: string]: unknown;
}

/** Mesmo formato que o código inspeciona no `ResponseError` do cliente (`meta.statusCode/body`). */
export class FakeResponseError extends Error {
  override readonly name = 'ResponseError';
  readonly meta: { statusCode: number; body: ErrorBody };

  constructor(statusCode: number, body: ErrorBody) {
    super(body.error?.type ?? `HTTP ${String(statusCode)}`);
    this.meta = { statusCode, body };
  }
}

const DOCUMENT_FIELDS = ['messageId', 'conversationId', 'senderId', 'content', 'createdAt'];

type BulkItem = Partial<Record<'index' | 'delete', estypes.BulkResponseItem>>;

interface BoolQuery {
  must: { multi_match: { query: string } }[];
  filter: estypes.QueryDslQueryContainer[];
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/** O mesmo escape do `encoder: 'html'` do Elasticsearch. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function highlight(content: string, terms: string[], pre: string, post: string): string {
  return content
    .split(/(\s+)/)
    .map((part) =>
      words(part).some((word) => terms.includes(word))
        ? `${pre}${escapeHtml(part)}${post}`
        : escapeHtml(part)
    )
    .join('');
}

function strictViolation(document: Record<string, unknown>): FakeResponseError | null {
  const extra = Object.keys(document).find((key) => !DOCUMENT_FIELDS.includes(key));
  return extra === undefined
    ? null
    : new FakeResponseError(400, {
        error: {
          type: 'strict_dynamic_mapping_exception',
          reason: `mapping set to strict, dynamic introduction of [${extra}] within [_doc] is not allowed`,
        },
      });
}

export class FakeSearchClient {
  private readonly store = new Map<string, Map<string, MessageDocument>>();

  /** Toda chamada registrada, na ordem. */
  readonly calls: FakeCall[] = [];

  /** Quando preenchido, toda chamada rejeita com este erro (Elasticsearch fora do ar). */
  failWith: Error | null = null;

  /** Quando preenchido, `search` devolve esta resposta em vez de avaliar a consulta. */
  searchResponse: estypes.SearchResponse<unknown, unknown> | null = null;

  /** Ids cujos itens do `bulk` falham com `es_rejected_execution_exception` (429). */
  readonly failingBulkIds = new Set<string>();

  readonly indices = {
    exists: async (params: estypes.IndicesExistsRequest): Promise<boolean> => {
      this.record('indices.exists', params);
      return this.store.has(String(params.index));
    },
    create: async (
      params: estypes.IndicesCreateRequest
    ): Promise<estypes.IndicesCreateResponse> => {
      this.record('indices.create', params);
      if (this.store.has(params.index)) {
        throw new FakeResponseError(400, {
          error: {
            type: 'resource_already_exists_exception',
            reason: `index [${params.index}] already exists`,
          },
        });
      }
      this.store.set(params.index, new Map());
      return { acknowledged: true, shards_acknowledged: true, index: params.index };
    },
    delete: async (
      params: estypes.IndicesDeleteRequest
    ): Promise<estypes.IndicesDeleteResponse> => {
      this.record('indices.delete', params);
      const index = String(params.index);
      if (!this.store.delete(index) && params.ignore_unavailable !== true) {
        throw new FakeResponseError(404, {
          error: { type: 'index_not_found_exception', reason: `no such index [${index}]` },
        });
      }
      return { acknowledged: true };
    },
  };

  /** O cliente como o código da busca o enxerga. */
  get client(): SearchClient {
    return this as unknown as SearchClient;
  }

  /** Documentos do índice (vazio se o índice não existe), em ordem de inserção. */
  documents(index: string): MessageDocument[] {
    return [...(this.store.get(index)?.values() ?? [])];
  }

  hasIndex(index: string): boolean {
    return this.store.has(index);
  }

  /** Chamadas de um método (`'search'`, `'bulk'`, `'indices.create'`, ...). */
  callsOf(method: string): FakeCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  reset(): void {
    this.store.clear();
    this.calls.length = 0;
    this.failWith = null;
    this.searchResponse = null;
    this.failingBulkIds.clear();
  }

  async index(
    params: estypes.IndexRequest<MessageDocument>
  ): Promise<Pick<estypes.IndexResponse, '_id' | '_index' | 'result'>> {
    this.record('index', params);
    const document = params.document as MessageDocument;
    const violation = strictViolation(document as unknown as Record<string, unknown>);
    if (violation !== null) {
      throw violation;
    }
    const docs = this.indexStore(params.index);
    const id = String(params.id);
    const result = docs.has(id) ? 'updated' : 'created';
    docs.set(id, { ...document });
    return { _index: params.index, _id: id, result };
  }

  async delete(
    params: estypes.DeleteRequest,
    options?: { ignore?: number[] }
  ): Promise<Pick<estypes.DeleteResponse, '_id' | '_index' | 'result'>> {
    this.record('delete', params, options);
    const deleted = this.store.get(params.index)?.delete(params.id) ?? false;
    const response = {
      _index: params.index,
      _id: params.id,
      result: deleted ? ('deleted' as const) : ('not_found' as const),
    };
    if (!deleted && options?.ignore?.includes(404) !== true) {
      throw new FakeResponseError(404, response);
    }
    return response;
  }

  async bulk(
    params: estypes.BulkRequest<MessageDocument>
  ): Promise<Pick<estypes.BulkResponse, 'errors' | 'items' | 'took'>> {
    this.record('bulk', params);
    const operations = [...(params.operations ?? [])] as Record<string, unknown>[];
    const items: BulkItem[] = [];
    while (operations.length > 0) {
      const action = operations.shift() as Record<string, { _index: string; _id: string }>;
      if ('index' in action) {
        const { _index, _id } = action.index as { _index: string; _id: string };
        const document = operations.shift() as unknown as MessageDocument;
        items.push({ index: this.bulkIndex(_index, _id, document) });
      } else {
        const { _index, _id } = action.delete as { _index: string; _id: string };
        items.push({ delete: this.bulkDelete(_index, _id) });
      }
    }
    const errors = items.some((item) => (item.index ?? item.delete)?.error !== undefined);
    return { took: 1, errors, items: items as estypes.BulkResponse['items'] };
  }

  async search(params: estypes.SearchRequest): Promise<estypes.SearchResponse<unknown, unknown>> {
    this.record('search', params);
    if (this.searchResponse !== null) {
      return this.searchResponse;
    }
    const index = String(params.index);
    const docs = this.store.get(index);
    if (docs === undefined) {
      throw new FakeResponseError(404, {
        error: { type: 'index_not_found_exception', reason: `no such index [${index}]` },
      });
    }

    const bool = (params.query as { bool: BoolQuery }).bool;
    const terms = words(bool.must[0]?.multi_match.query ?? '');
    const matches = [...docs.values()]
      .filter((doc) => bool.filter.every((filter) => this.passes(doc, filter)))
      .map((doc) => ({ doc, score: words(doc.content).filter((w) => terms.includes(w)).length }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.doc.createdAt.localeCompare(a.doc.createdAt));

    const tags = params.highlight as { pre_tags: string[]; post_tags: string[] };
    const pre = tags.pre_tags[0] ?? '<em>';
    const post = tags.post_tags[0] ?? '</em>';
    const facetSize = (params.aggs as { conversations: { terms: { size: number } } }).conversations
      .terms.size;

    return {
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: matches.length, relation: 'eq' },
        max_score: matches[0]?.score ?? null,
        hits: matches.slice(0, params.size ?? 10).map(({ doc, score }) => ({
          _index: index,
          _id: doc.messageId,
          _score: score,
          highlight: { content: [highlight(doc.content, terms, pre, post)] },
          sort: [score, Date.parse(doc.createdAt)],
        })),
      },
      aggregations: {
        conversations: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: this.countByConversation(matches.map(({ doc }) => doc)).slice(0, facetSize),
        },
      },
    };
  }

  private record(method: string, params: unknown, options?: unknown): void {
    this.calls.push(options === undefined ? { method, params } : { method, params, options });
    if (this.failWith !== null) {
      throw this.failWith;
    }
  }

  /** Como no Elasticsearch, indexar num índice inexistente o cria. */
  private indexStore(index: string): Map<string, MessageDocument> {
    let docs = this.store.get(index);
    if (docs === undefined) {
      docs = new Map();
      this.store.set(index, docs);
    }
    return docs;
  }

  private bulkIndex(
    index: string,
    id: string,
    document: MessageDocument
  ): estypes.BulkResponseItem {
    const violation = this.failingBulkIds.has(id)
      ? new FakeResponseError(429, {
          error: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
        })
      : strictViolation(document as unknown as Record<string, unknown>);
    if (violation !== null) {
      return {
        _index: index,
        _id: id,
        status: violation.meta.statusCode,
        error: violation.meta.body.error,
      };
    }
    const docs = this.indexStore(index);
    const status = docs.has(id) ? 200 : 201;
    docs.set(id, { ...document });
    return { _index: index, _id: id, status, result: status === 201 ? 'created' : 'updated' };
  }

  private bulkDelete(index: string, id: string): estypes.BulkResponseItem {
    const deleted = this.store.get(index)?.delete(id) ?? false;
    return deleted
      ? { _index: index, _id: id, status: 200, result: 'deleted' }
      : { _index: index, _id: id, status: 404, result: 'not_found' };
  }

  private passes(doc: MessageDocument, filter: estypes.QueryDslQueryContainer): boolean {
    if (filter.terms !== undefined) {
      const values = (filter.terms as { conversationId: string[] }).conversationId;
      return values.includes(doc.conversationId);
    }
    if (filter.term !== undefined) {
      return (filter.term as { senderId: string }).senderId === doc.senderId;
    }
    const range = (filter.range as { createdAt: { gte?: string; lte?: string } }).createdAt;
    const at = Date.parse(doc.createdAt);
    return (
      (range.gte === undefined || at >= Date.parse(range.gte)) &&
      (range.lte === undefined || at <= Date.parse(range.lte))
    );
  }

  private countByConversation(docs: MessageDocument[]): { key: string; doc_count: number }[] {
    const counts = new Map<string, number>();
    for (const doc of docs) {
      counts.set(doc.conversationId, (counts.get(doc.conversationId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, doc_count]) => ({ key, doc_count }))
      .sort((a, b) => b.doc_count - a.doc_count || a.key.localeCompare(b.key));
  }
}
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/support/elasticsearch --coverage=false`

Expected: PASS (18 testes).

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/support/elasticsearch/fakeSearchClient.test.ts tests/support/elasticsearch/fakeSearchClient.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add tests/support/elasticsearch/fakeSearchClient.test.ts \
  tests/support/elasticsearch/fakeSearchClient.ts
git commit -m "✅ test: adiciona FakeSearchClient (Elasticsearch em memória) com as respostas do 8.17"
```


---

### Task 4: `SearchIndexService` — índice idempotente, indexação e reindex em lotes

**Files:**
- Create: `src/modules/search/interfaces/ISearchIndexService.ts`
- Create: `src/modules/search/interfaces/index.ts`
- Create: `src/modules/search/services/SearchIndexService.ts`
- Create: `src/modules/search/services/index.ts`
- Create: `tests/unit/modules/search/services/SearchIndexService.test.ts`

**Interfaces:**
- Consumes: `IMessageService.forEachForIndexing` e `IndexableMessage` (Task 1); constantes, `SearchClient`, `MessageDocument`, `ReindexOptions`, `ReindexResult` (Task 2); `FakeSearchClient`/`FakeResponseError` (Task 3) nos testes.
- Produces: `ISearchIndexService` (`@/modules/search/interfaces`) — `ensureIndex(): Promise<boolean>` (`true` só quando criou), `indexMessage(document: MessageDocument): Promise<void>`, `deleteMessage(messageId: string): Promise<void>`, `reindexAll(options?: ReindexOptions): Promise<ReindexResult>`.
- Produces: `SearchIndexService` (`@/modules/search/services`, arquivo `services/SearchIndexService.ts`) — `constructor({ client = elasticsearch, index = SEARCH_CONSTANTS.MESSAGES_INDEX, messages = messageService, batchSize = 500 }: SearchIndexServiceOptions = {})` — e o singleton `searchIndexService`; tipo `SearchIndexServiceOptions`.

`ensureIndex` cria com `MESSAGES_INDEX_SETTINGS`/`MESSAGES_INDEX_MAPPINGS` e nunca mexe num índice existente (decisão 11). `indexMessage` usa `_id = messageId` e `refresh: false`; `deleteMessage` usa `{ ignore: [404] }`. `reindexAll` (decisão 5): `--recreate` apaga o índice (`ignore_unavailable`), garante o índice, percorre as mensagens em lotes e manda um `bulk` por lote (index para as com texto, delete para as apagadas), contando e logando item a item.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/unit/modules/search/services/SearchIndexService.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import type { IndexableMessage } from '@/modules/chat/types';
import {
  MESSAGES_INDEX_MAPPINGS,
  MESSAGES_INDEX_SETTINGS,
  SEARCH_CONSTANTS,
} from '@/modules/search/constants';
import { SearchIndexService, searchIndexService } from '@/modules/search/services';
import type { MessageDocument } from '@/modules/search/types';
import { logger } from '@/shared/logger';
import {
  FakeResponseError,
  FakeSearchClient,
} from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages-test';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = new Date('2026-09-27T10:00:00.000Z');

function message(id: string, text: string | null = `texto ${id}`): IndexableMessage {
  return { id, conversationId: CONVERSATION, senderId: ANA, text, createdAt: CREATED_AT };
}

function document(id: string, content = `texto ${id}`): MessageDocument {
  return {
    messageId: id,
    conversationId: CONVERSATION,
    senderId: ANA,
    content,
    createdAt: CREATED_AT.toISOString(),
  };
}

/** Varredura do chat em memória: entrega `all` em lotes de `batchSize`, como o MessageService. */
function scanner(all: IndexableMessage[]): { forEachForIndexing: jest.Mock } {
  return {
    forEachForIndexing: jest.fn(
      async (batchSize: number, handler: (batch: IndexableMessage[]) => Promise<void>) => {
        for (let start = 0; start < all.length; start += batchSize) {
          await handler(all.slice(start, start + batchSize));
        }
        return all.length;
      }
    ),
  };
}

describe('SearchIndexService', () => {
  let fake: FakeSearchClient;

  beforeEach(() => {
    fake = new FakeSearchClient();
  });

  function service(all: IndexableMessage[] = [], batchSize = 2): SearchIndexService {
    return new SearchIndexService({
      client: fake.client,
      index: INDEX,
      messages: scanner(all),
      batchSize,
    });
  }

  it('exporta a instância padrão (cliente da aplicação, índice das constantes)', () => {
    expect(searchIndexService).toBeInstanceOf(SearchIndexService);
    expect(SEARCH_CONSTANTS.MESSAGES_INDEX).toBe('messages');
  });

  describe('ensureIndex', () => {
    it('cria o índice com settings e mapping quando não existe', async () => {
      await expect(service().ensureIndex()).resolves.toBe(true);

      expect(fake.callsOf('indices.create')).toEqual([
        {
          method: 'indices.create',
          params: {
            index: INDEX,
            settings: MESSAGES_INDEX_SETTINGS,
            mappings: MESSAGES_INDEX_MAPPINGS,
          },
        },
      ]);
      expect(logger.info).toHaveBeenCalledWith('Índice de busca criado', { index: INDEX });
    });

    it('idempotente: índice existente não é recriado nem alterado', async () => {
      await service().ensureIndex();

      await expect(service().ensureIndex()).resolves.toBe(false);
      expect(fake.callsOf('indices.create')).toHaveLength(1);
    });

    it('corrida entre instâncias: resource_already_exists_exception no create vale como existente', async () => {
      await fake.indices.create({ index: INDEX });
      // Outra instância criou o índice entre o `exists` e o `create` desta.
      jest.spyOn(fake.indices, 'exists').mockResolvedValue(false);

      await expect(service().ensureIndex()).resolves.toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('Elasticsearch fora do ar → propaga', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service().ensureIndex()).rejects.toThrow('ECONNREFUSED');
    });

    it('erro do create que não é "já existe" propaga', async () => {
      jest.spyOn(fake.indices, 'create').mockRejectedValue(
        new FakeResponseError(400, {
          error: { type: 'illegal_argument_exception', reason: 'analyzer inválido' },
        })
      );

      await expect(service().ensureIndex()).rejects.toMatchObject({
        meta: { body: { error: { type: 'illegal_argument_exception' } } },
      });
    });
  });

  describe('indexMessage/deleteMessage', () => {
    it('indexa com _id = messageId e refresh: false', async () => {
      await service().indexMessage(document('m1'));

      expect(fake.callsOf('index')).toEqual([
        {
          method: 'index',
          params: { index: INDEX, id: 'm1', document: document('m1'), refresh: false },
        },
      ]);
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
    });

    it('remove do índice; documento ausente (404) não é erro', async () => {
      await service().indexMessage(document('m1'));

      await service().deleteMessage('m1');
      await expect(service().deleteMessage('m1')).resolves.toBeUndefined();

      expect(fake.documents(INDEX)).toEqual([]);
      expect(fake.callsOf('delete')[0]).toEqual({
        method: 'delete',
        params: { index: INDEX, id: 'm1' },
        options: { ignore: [404] },
      });
    });

    it('Elasticsearch fora do ar → rejeita (quem chama loga)', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service().indexMessage(document('m1'))).rejects.toThrow('ECONNREFUSED');
      await expect(service().deleteMessage('m1')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('reindexAll', () => {
    it('garante o índice e indexa em lotes via bulk; apagadas viram delete', async () => {
      await fake.index({ index: INDEX, id: 'm3', document: document('m3') });
      const all = [message('m1'), message('m2'), message('m3', null), message('m4')];
      const indexer = new SearchIndexService({
        client: fake.client,
        index: INDEX,
        messages: scanner(all),
        batchSize: 2,
      });

      const result = await indexer.reindexAll();

      expect(result).toEqual({ scanned: 4, indexed: 3, deleted: 1, failed: 0 });
      expect(
        fake
          .documents(INDEX)
          .map((doc) => doc.messageId)
          .sort()
      ).toEqual(['m1', 'm2', 'm4']);
      expect(fake.callsOf('bulk').map((call) => call.params)).toEqual([
        {
          operations: [
            { index: { _index: INDEX, _id: 'm1' } },
            document('m1'),
            { index: { _index: INDEX, _id: 'm2' } },
            document('m2'),
          ],
        },
        {
          operations: [
            { delete: { _index: INDEX, _id: 'm3' } },
            { index: { _index: INDEX, _id: 'm4' } },
            document('m4'),
          ],
        },
      ]);
      expect(fake.callsOf('indices.delete')).toEqual([]);
    });

    it('idempotente: rodar de novo sobrescreve; apagada que já não estava lá não conta', async () => {
      const all = [message('m1'), message('m2', null)];

      await service(all).reindexAll();
      const again = await service(all).reindexAll();

      expect(again).toEqual({ scanned: 2, indexed: 1, deleted: 0, failed: 0 });
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
    });

    it('usa o lote padrão de 500 mensagens', async () => {
      const messages = scanner([]);

      await new SearchIndexService({ client: fake.client, index: INDEX, messages }).reindexAll();

      expect(messages.forEachForIndexing).toHaveBeenCalledWith(500, expect.any(Function));
    });

    it('--recreate apaga (se existir) e recria o índice antes', async () => {
      await fake.indices.create({ index: INDEX });
      await fake.index({ index: INDEX, id: 'orfa', document: document('orfa') });
      fake.calls.length = 0;

      const result = await service([message('m1')]).reindexAll({ recreate: true });

      expect(result).toEqual({ scanned: 1, indexed: 1, deleted: 0, failed: 0 });
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
      expect(fake.calls.map((call) => call.method)).toEqual([
        'indices.delete',
        'indices.exists',
        'indices.create',
        'bulk',
      ]);
      expect(fake.callsOf('indices.delete')[0]?.params).toEqual({
        index: INDEX,
        ignore_unavailable: true,
      });
    });

    it('--recreate com o índice ausente também funciona', async () => {
      await expect(service([]).reindexAll({ recreate: true })).resolves.toEqual({
        scanned: 0,
        indexed: 0,
        deleted: 0,
        failed: 0,
      });
      expect(fake.hasIndex(INDEX)).toBe(true);
    });

    it('erro item a item: conta, loga com o messageId e segue com os demais', async () => {
      fake.failingBulkIds.add('m2');

      const result = await service([message('m1'), message('m2'), message('m3')]).reindexAll();

      expect(result).toEqual({ scanned: 3, indexed: 2, deleted: 0, failed: 1 });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Falha ao indexar mensagem no reindex da busca',
        undefined,
        {
          messageId: 'm2',
          status: 429,
          reason: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
        }
      );
    });

    it('bulk rejeitado inteiro (Elasticsearch fora do ar) interrompe e propaga', async () => {
      jest.spyOn(fake, 'bulk').mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        service([message('m1'), message('m2'), message('m3')]).reindexAll()
      ).rejects.toThrow('ECONNREFUSED');
      expect(fake.bulk).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/search/services --coverage=false`

Expected: FAIL — `Could not locate module @/modules/search/services` (Test suite failed to run).

- [ ] **Step 3: Implementar**

Criar `src/modules/search/interfaces/ISearchIndexService.ts`:

```ts
import type { MessageDocument, ReindexOptions, ReindexResult } from '../types';

export interface ISearchIndexService {
  /**
   * Cria o índice de mensagens (settings + mapping) se ainda não existe; se existe, não mexe.
   * Idempotente também sob corrida entre instâncias. Devolve `true` só quando criou.
   */
  ensureIndex(): Promise<boolean>;
  /** Indexa (ou sobrescreve) o documento com `_id = messageId`, sem forçar refresh. */
  indexMessage(document: MessageDocument): Promise<void>;
  /** Remove a mensagem do índice; documento ausente não é erro. */
  deleteMessage(messageId: string): Promise<void>;
  /**
   * Percorre todas as mensagens do MongoDB em lotes e sincroniza o índice via `bulk`: indexa as
   * não apagadas e remove as apagadas (idempotente). `recreate` apaga e recria o índice antes.
   */
  reindexAll(options?: ReindexOptions): Promise<ReindexResult>;
}
```

Criar `src/modules/search/interfaces/index.ts`:

```ts
export type { ISearchIndexService } from './ISearchIndexService';
```

Criar `src/modules/search/services/SearchIndexService.ts`:

```ts
import type { IMessageService } from '@/modules/chat/interfaces';
import { messageService } from '@/modules/chat/services/MessageService';
import type { IndexableMessage } from '@/modules/chat/types';
import type { estypes } from '@elastic/elasticsearch';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { logger } from '@/shared/logger';
import { MESSAGES_INDEX_MAPPINGS, MESSAGES_INDEX_SETTINGS, SEARCH_CONSTANTS } from '../constants';
import type { ISearchIndexService } from '../interfaces';
import type { MessageDocument, ReindexOptions, ReindexResult, SearchClient } from '../types';

export interface SearchIndexServiceOptions {
  /** @default o cliente `elasticsearch` da aplicação */
  client?: SearchClient;
  /** @default SEARCH_CONSTANTS.MESSAGES_INDEX */
  index?: string;
  /** Varredura das mensagens (reindex). @default messageService */
  messages?: Pick<IMessageService, 'forEachForIndexing'>;
  /** @default SEARCH_CONSTANTS.REINDEX_BATCH */
  batchSize?: number;
}

/** Erro do Elasticsearch com o `type` informado (`meta.body.error.type` do `ResponseError`). */
function hasErrorType(error: unknown, type: string): boolean {
  const meta = (error as { meta?: { body?: { error?: { type?: unknown } } } }).meta;
  return meta?.body?.error?.type === type;
}

/** Uma linha do corpo NDJSON do `bulk`: ação (`index`/`delete`) ou o documento da ação `index`. */
type BulkLine = estypes.BulkOperationContainer | MessageDocument;

function toDocument(message: IndexableMessage, content: string): MessageDocument {
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Índice de mensagens no Elasticsearch: criação, indexação unitária e reindex em lotes. */
export class SearchIndexService implements ISearchIndexService {
  private readonly client: SearchClient;
  private readonly index: string;
  private readonly messages: Pick<IMessageService, 'forEachForIndexing'>;
  private readonly batchSize: number;

  constructor({
    client = elasticsearch,
    index = SEARCH_CONSTANTS.MESSAGES_INDEX,
    messages = messageService,
    batchSize = SEARCH_CONSTANTS.REINDEX_BATCH,
  }: SearchIndexServiceOptions = {}) {
    this.client = client;
    this.index = index;
    this.messages = messages;
    this.batchSize = batchSize;
  }

  async ensureIndex(): Promise<boolean> {
    if (await this.client.indices.exists({ index: this.index })) {
      return false;
    }
    try {
      await this.client.indices.create({
        index: this.index,
        settings: MESSAGES_INDEX_SETTINGS,
        mappings: MESSAGES_INDEX_MAPPINGS,
      });
    } catch (error) {
      // Outra instância criou o índice entre o `exists` e o `create`: o resultado é o mesmo.
      if (hasErrorType(error, 'resource_already_exists_exception')) {
        return false;
      }
      throw error;
    }
    logger.info('Índice de busca criado', { index: this.index });
    return true;
  }

  async indexMessage(document: MessageDocument): Promise<void> {
    // Sem refresh forçado: a mensagem aparece na busca no próximo refresh do índice (~1 s).
    await this.client.index({
      index: this.index,
      id: document.messageId,
      document,
      refresh: false,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.client.delete({ index: this.index, id: messageId }, { ignore: [404] });
  }

  async reindexAll({ recreate = false }: ReindexOptions = {}): Promise<ReindexResult> {
    if (recreate) {
      await this.client.indices.delete({ index: this.index, ignore_unavailable: true });
    }
    await this.ensureIndex();

    const result: ReindexResult = { scanned: 0, indexed: 0, deleted: 0, failed: 0 };
    result.scanned = await this.messages.forEachForIndexing(this.batchSize, (batch) =>
      this.syncBatch(batch, result)
    );
    return result;
  }

  /** Um `bulk` por lote: indexa as mensagens com texto e remove as apagadas. */
  private async syncBatch(batch: IndexableMessage[], result: ReindexResult): Promise<void> {
    const operations = batch.flatMap<BulkLine>((message) =>
      message.text === null
        ? [{ delete: { _index: this.index, _id: message.id } }]
        : [{ index: { _index: this.index, _id: message.id } }, toDocument(message, message.text)]
    );
    const response = await this.client.bulk({ operations });

    for (const item of response.items) {
      const outcome = item.index ?? item.delete;
      if (outcome?.error !== undefined) {
        result.failed++;
        logger.error('Falha ao indexar mensagem no reindex da busca', undefined, {
          messageId: outcome._id,
          status: outcome.status,
          reason: outcome.error,
        });
      } else if (item.index !== undefined) {
        result.indexed++;
      } else if (outcome?.status === 200) {
        // 404 = a apagada já não estava no índice (nada a contar).
        result.deleted++;
      }
    }
  }
}

export const searchIndexService = new SearchIndexService();
```

Criar `src/modules/search/services/index.ts`:

```ts
export { SearchIndexService, searchIndexService } from './SearchIndexService';
export type { SearchIndexServiceOptions } from './SearchIndexService';
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/search/services --coverage=false`

Expected: PASS (16 testes).

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/search/interfaces/ISearchIndexService.ts src/modules/search/interfaces/index.ts src/modules/search/services/SearchIndexService.ts src/modules/search/services/index.ts tests/unit/modules/search/services/SearchIndexService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/search/interfaces/ISearchIndexService.ts \
  src/modules/search/interfaces/index.ts \
  src/modules/search/services/SearchIndexService.ts \
  src/modules/search/services/index.ts \
  tests/unit/modules/search/services/SearchIndexService.test.ts
git commit -m "✨ feat: SearchIndexService com índice idempotente, indexação e reindex em lotes"
```


---

### Task 5: MessageIndexer (listeners) e índice garantido no `bootstrap()`

**Files:**
- Modify: `src/bootstrap.ts`
- Create: `src/modules/search/listeners/index.ts`
- Create: `src/modules/search/listeners/search.listeners.ts`
- Create: `tests/unit/modules/search/listeners/search.listeners.test.ts`

**Interfaces:**
- Consumes: `ISearchIndexService`, `SearchIndexService`, `searchIndexService` (Task 4); payloads de `ChatEvents.MESSAGE_SENT` (`messageId`, `conversationId`, `senderId`, `text`, `createdAt: Date`) e `ChatEvents.MESSAGE_DELETED` (`messageId`).
- Produces: `registerSearchIndexListeners(bus = eventBus, indexer: Pick<ISearchIndexService, 'indexMessage' | 'deleteMessage'> = searchIndexService): () => void` em `@/modules/search/listeners`.
- Produces: `bootstrap()` chama `searchIndexService.ensureIndex()` logo após `connectElasticsearch()` e registra `registerSearchIndexListeners()` junto dos listeners do chat.

Subscribers `{ async: true }`: o envio e a exclusão não esperam o Elasticsearch. Falha vira `logger.error` com o `messageId` (nunca relançada); a recuperação é o reindex. `src/bootstrap.ts` está fora da cobertura (wiring), como antes.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/unit/modules/search/listeners/search.listeners.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { registerSearchIndexListeners } from '@/modules/search/listeners';
import { SearchIndexService } from '@/modules/search/services';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { FakeSearchClient } from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages';
const MESSAGE_ID = '65f000000000000000000001';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-09-27T10:00:00.000Z');

/** Os listeners são `{ async: true }`: rodam num setImmediate depois do publish. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function messageSent(text = 'Meu coração'): EventPayload<ChatEvents.MESSAGE_SENT> {
  return {
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION,
    conversationType: 'direct',
    senderId: ANA,
    text,
    mentions: [],
    replyTo: null,
    createdAt: CREATED_AT,
    participantIds: [ANA, BOB],
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION,
      senderId: ANA,
      content: { type: 'text', text },
      replyTo: null,
      mentions: [],
      clientMessageId: null,
      status: { sentAt: CREATED_AT, deliveredTo: [], readBy: [] },
      deletedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  };
}

const messageDeleted = { messageId: MESSAGE_ID, conversationId: CONVERSATION, deletedBy: ANA };

describe('registerSearchIndexListeners (MessageIndexer)', () => {
  let bus: EventBus;
  let fake: FakeSearchClient;
  let unregister: () => void;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    fake = new FakeSearchClient();
    unregister = registerSearchIndexListeners(
      bus,
      new SearchIndexService({ client: fake.client, index: INDEX })
    );
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('chat:message-sent indexa a mensagem (fora do caminho de quem publica)', async () => {
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    // O publish já voltou e a indexação ainda não rodou: ela não atrasa o envio.
    expect(fake.calls).toEqual([]);
    await flushDetached();

    expect(fake.documents(INDEX)).toEqual([
      {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION,
        senderId: ANA,
        content: 'Meu coração',
        createdAt: '2026-09-27T10:00:00.000Z',
      },
    ]);
  });

  it('chat:message-deleted remove do índice (e apagar de novo não é erro)', async () => {
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(fake.documents(INDEX)).toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('falhas são logadas com o messageId e nunca propagam', async () => {
    fake.failWith = new Error('connect ECONNREFUSED');

    await expect(bus.publish(ChatEvents.MESSAGE_SENT, messageSent())).resolves.toEqual(
      expect.any(String)
    );
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao indexar a mensagem na busca',
      fake.failWith,
      { messageId: MESSAGE_ID }
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao remover a mensagem da busca',
      fake.failWith,
      { messageId: MESSAGE_ID }
    );
  });

  it('rejeição que não é Error vira Error no log', async () => {
    unregister();
    unregister = registerSearchIndexListeners(bus, {
      indexMessage: () => Promise.reject('timeout'),
      deleteMessage: () => Promise.reject('timeout'),
    });

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(jest.mocked(logger.error).mock.calls[0]?.[1]).toEqual(new Error('timeout'));
  });

  it('a função devolvida cancela as inscrições', async () => {
    unregister();

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(fake.calls).toEqual([]);
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_DELETED)).toBe(false);
  });

  it('usa o eventBus e o searchIndexService padrão quando nada é injetado', () => {
    const unregisterDefault = registerSearchIndexListeners();

    expect(typeof unregisterDefault).toBe('function');
    unregisterDefault();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/search/listeners --coverage=false`

Expected: FAIL — `Could not locate module @/modules/search/listeners` (Test suite failed to run).

- [ ] **Step 3: Implementar**

Criar `src/modules/search/listeners/search.listeners.ts`:

```ts
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import type { ISearchIndexService } from '../interfaces';
import { searchIndexService } from '../services/SearchIndexService';

const DETACHED = { async: true } as const;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * MessageIndexer: mantém o índice de busca em dia com o chat.
 *
 * - `chat:message-sent` → indexa a mensagem (`_id = messageId`).
 * - `chat:message-deleted` → remove do índice (documento ausente não é erro).
 *
 * Subscribers `{ async: true }`: não atrasam o envio nem a exclusão. Uma falha (Elasticsearch
 * fora do ar) é logada com o `messageId` e nunca relançada; a recuperação é o reindex
 * (`npm run search:reindex`). Registrado no `bootstrap()` depois do `ensureIndex()`; devolve a
 * função que cancela as inscrições.
 */
export function registerSearchIndexListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  indexer: Pick<ISearchIndexService, 'indexMessage' | 'deleteMessage'> = searchIndexService
): () => void {
  const unsubscribers = [
    bus.subscribe(
      ChatEvents.MESSAGE_SENT,
      async ({ payload }) => {
        try {
          await indexer.indexMessage({
            messageId: payload.messageId,
            conversationId: payload.conversationId,
            senderId: payload.senderId,
            content: payload.text,
            createdAt: payload.createdAt.toISOString(),
          });
        } catch (error) {
          logger.error('Falha ao indexar a mensagem na busca', toError(error), {
            messageId: payload.messageId,
          });
        }
      },
      DETACHED
    ),
    bus.subscribe(
      ChatEvents.MESSAGE_DELETED,
      async ({ payload }) => {
        try {
          await indexer.deleteMessage(payload.messageId);
        } catch (error) {
          logger.error('Falha ao remover a mensagem da busca', toError(error), {
            messageId: payload.messageId,
          });
        }
      },
      DETACHED
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

Criar `src/modules/search/listeners/index.ts`:

```ts
export { registerSearchIndexListeners } from './search.listeners';
```

Em `src/bootstrap.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import { registerChatCacheListeners, registerChatListeners } from './modules/chat/listeners';
import { registerPresenceCacheListeners } from './modules/presence/listeners';
import { registerUserCacheListeners } from './modules/user/listeners';
```

por:

```ts
import { registerChatCacheListeners, registerChatListeners } from './modules/chat/listeners';
import { registerPresenceCacheListeners } from './modules/presence/listeners';
import { registerSearchIndexListeners } from './modules/search/listeners';
import { searchIndexService } from './modules/search/services/SearchIndexService';
import { registerUserCacheListeners } from './modules/user/listeners';
```

2. Substituir:

```ts
  await connectMongo();
  await connectElasticsearch();
  registerChatListeners();
  // Invalidação do cache Redis por evento (perfis, bloqueios, participantes, audiência).
  registerUserCacheListeners();
```

por:

```ts
  await connectMongo();
  await connectElasticsearch();
  // Índice de mensagens: cria se não existe (se existe, não mexe) antes de indexar qualquer coisa.
  await searchIndexService.ensureIndex();
  registerChatListeners();
  registerSearchIndexListeners();
  // Invalidação do cache Redis por evento (perfis, bloqueios, participantes, audiência).
  registerUserCacheListeners();
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/search/listeners --coverage=false`

Expected: PASS (6 testes).

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/bootstrap.ts src/modules/search/listeners/index.ts src/modules/search/listeners/search.listeners.ts tests/unit/modules/search/listeners/search.listeners.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/bootstrap.ts \
  src/modules/search/listeners/index.ts \
  src/modules/search/listeners/search.listeners.ts \
  tests/unit/modules/search/listeners/search.listeners.test.ts
git commit -m "✨ feat: MessageIndexer indexa e remove mensagens pelo EventBus; índice garantido no bootstrap"
```


---

### Task 6: `SearchService` — autorização, consulta, highlight, facetas e hidratação

**Files:**
- Create: `src/modules/search/interfaces/ISearchService.ts`
- Modify: `src/modules/search/interfaces/index.ts`
- Create: `src/modules/search/services/SearchService.ts`
- Modify: `src/modules/search/services/index.ts`
- Create: `tests/unit/modules/search/services/SearchService.test.ts`

**Interfaces:**
- Consumes: `IConversationService.getUserConversationIds` (existente — decisão 4), `IMessageService.findByIdsForSearch` (Task 1), `ConversationNotFoundException` (`@/modules/chat/errors`), constantes/tipos/erros (Task 2), `FakeSearchClient` (Task 3) nos testes.
- Produces: `ISearchService.searchMessages(userId: string, params: SearchMessagesParams): Promise<MessageSearchResult>` (`@/modules/search/interfaces`).
- Produces: `SearchService` (`services/SearchService.ts`, exportado por `@/modules/search/services`) — `constructor({ client = elasticsearch, index = SEARCH_CONSTANTS.MESSAGES_INDEX, conversations = conversationService, messages = messageService, now = performance.now.bind(performance) }: SearchServiceOptions = {})` — e o singleton `searchService`; tipo `SearchServiceOptions`.

Fluxo (spec §4 + decisões 6–8): `from > to` → 400 antes de tudo; conversas do usuário → com `conversationId`, só ela ou 404; nenhuma conversa → resposta vazia sem Elasticsearch nem MongoDB; consulta (decisão 7) → erro do Elasticsearch vira 503; hidratação pela ordem dos hits, descartando o que o MongoDB não devolveu (apagadas) e conversas fora do conjunto permitido; facetas da agregação; `tookMs` pelo relógio injetável.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/unit/modules/search/services/SearchService.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import type { estypes } from '@elastic/elasticsearch';
import { ConversationNotFoundException } from '@/modules/chat/errors';
import type { MessageDTO } from '@/modules/chat/types';
import { InvalidSearchRangeException, SearchUnavailableException } from '@/modules/search/errors';
import { SearchService, searchService } from '@/modules/search/services';
import type { MessageDocument, SearchMessagesParams } from '@/modules/search/types';
import { logger } from '@/shared/logger';
import { FakeSearchClient } from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages';
const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CONV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BASE = Date.parse('2026-09-27T10:00:00.000Z');

function at(minutes: number): Date {
  return new Date(BASE + minutes * 60_000);
}

function dto(
  id: string,
  conversationId: string,
  senderId: string,
  text: string,
  minutes: number
): MessageDTO {
  return {
    id,
    conversationId,
    senderId,
    content: { type: 'text', text },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: at(minutes), deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: at(minutes),
    updatedAt: at(minutes),
  };
}

function toDocument(message: MessageDTO): MessageDocument {
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content?.text ?? '',
    createdAt: message.createdAt.toISOString(),
  };
}

const M1 = dto('m1', CONV_A, ANA, 'Meu coração está feliz', 0);
const M2 = dto('m2', CONV_A, BOB, 'coração <b>partido</b> e coração inteiro', 10);
const M3 = dto('m3', CONV_B, ANA, 'CORAÇÃO', 20);
const M_OTHER = dto('m9', CONV_OTHER, BOB, 'coração alheio', 30);

function params(overrides: Partial<SearchMessagesParams> = {}): SearchMessagesParams {
  return { q: 'coração', limit: 20, ...overrides };
}

function configuredResponse(
  overrides: Partial<estypes.SearchResponse<unknown, unknown>> = {}
): estypes.SearchResponse<unknown, unknown> {
  return {
    took: 3,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' }, hits: [] },
    ...overrides,
  };
}

describe('SearchService', () => {
  let fake: FakeSearchClient;
  let conversations: { getUserConversationIds: jest.Mock };
  let stored: MessageDTO[];
  let messages: { findByIdsForSearch: jest.Mock };
  let clock: number;
  let service: SearchService;

  beforeEach(async () => {
    fake = new FakeSearchClient();
    await fake.indices.create({ index: INDEX });
    stored = [M1, M2, M3, M_OTHER];
    for (const message of stored) {
      await fake.index({ index: INDEX, id: message.id, document: toDocument(message) });
    }
    fake.calls.length = 0;

    conversations = { getUserConversationIds: jest.fn().mockResolvedValue([CONV_A, CONV_B]) };
    messages = {
      findByIdsForSearch: jest.fn(async (ids: string[]) =>
        // O MongoDB devolve em qualquer ordem: aqui, invertida.
        stored.filter((message) => ids.includes(message.id)).reverse()
      ),
    };
    clock = 1000;
    service = new SearchService({
      client: fake.client,
      index: INDEX,
      conversations,
      messages,
      now: () => (clock += 7) - 7,
    });
  });

  it('exporta a instância padrão', () => {
    expect(searchService).toBeInstanceOf(SearchService);
  });

  it('manda ao Elasticsearch a consulta do spec (relevância, filtros, highlight, facetas)', async () => {
    await service.searchMessages(ANA, params({ limit: 5 }));

    expect(fake.callsOf('search')).toEqual([
      {
        method: 'search',
        params: {
          index: INDEX,
          size: 5,
          _source: false,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: 'coração',
                    type: 'most_fields',
                    fields: ['content', 'content.exact^2'],
                  },
                },
              ],
              filter: [{ terms: { conversationId: [CONV_A, CONV_B] } }],
            },
          },
          sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
          highlight: {
            encoder: 'html',
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fields: {
              content: { fragment_size: 150, number_of_fragments: 3 },
              'content.exact': { fragment_size: 150, number_of_fragments: 3 },
            },
          },
          aggs: { conversations: { terms: { field: 'conversationId', size: 10 } } },
        },
      },
    ]);
    expect(conversations.getUserConversationIds).toHaveBeenCalledWith(ANA);
  });

  it('hidrata no MongoDB mantendo a ordem do Elasticsearch, com highlight, score, total, facetas e tookMs', async () => {
    const result = await service.searchMessages(ANA, params());

    expect(result).toEqual({
      items: [
        {
          message: M2,
          highlights: [
            '<mark>coração</mark> &lt;b&gt;partido&lt;&#x2F;b&gt; e <mark>coração</mark> inteiro',
          ],
          score: 2,
        },
        { message: M3, highlights: ['<mark>CORAÇÃO</mark>'], score: 1 },
        { message: M1, highlights: ['Meu <mark>coração</mark> está feliz'], score: 1 },
      ],
      total: 3,
      facets: {
        conversations: [
          { conversationId: CONV_A, count: 2 },
          { conversationId: CONV_B, count: 1 },
        ],
      },
      tookMs: 7,
    });
    expect(messages.findByIdsForSearch).toHaveBeenCalledWith(['m2', 'm3', 'm1']);
  });

  describe('filtros', () => {
    it('conversationId permitido restringe a ela; senderId e período viram filtros', async () => {
      const result = await service.searchMessages(
        ANA,
        params({ conversationId: CONV_A, senderId: ANA, from: at(-5), to: at(5) })
      );

      expect(result.items.map((item) => item.message.id)).toEqual(['m1']);
      expect(fake.callsOf('search')[0]?.params).toMatchObject({
        query: {
          bool: {
            filter: [
              { terms: { conversationId: [CONV_A] } },
              { term: { senderId: ANA } },
              {
                range: {
                  createdAt: { gte: '2026-09-27T09:55:00.000Z', lte: '2026-09-27T10:05:00.000Z' },
                },
              },
            ],
          },
        },
      });
    });

    it('só from ou só to', async () => {
      const onlyFrom = await service.searchMessages(ANA, params({ from: at(15) }));
      const onlyTo = await service.searchMessages(ANA, params({ to: at(5) }));

      expect(onlyFrom.items.map((item) => item.message.id)).toEqual(['m3']);
      expect(onlyTo.items.map((item) => item.message.id)).toEqual(['m1']);
      const filters = fake
        .callsOf('search')
        .map(
          (call) => (call.params as { query: { bool: { filter: unknown[] } } }).query.bool.filter[1]
        );
      expect(filters).toEqual([
        { range: { createdAt: { gte: '2026-09-27T10:15:00.000Z', lte: undefined } } },
        { range: { createdAt: { gte: undefined, lte: '2026-09-27T10:05:00.000Z' } } },
      ]);
    });

    it('from igual a to é válido', async () => {
      const result = await service.searchMessages(ANA, params({ from: at(0), to: at(0) }));

      expect(result.items.map((item) => item.message.id)).toEqual(['m1']);
    });
  });

  describe('autorização', () => {
    it('conversationId de conversa da qual não participa → 404, sem consultar o Elasticsearch', async () => {
      await expect(
        service.searchMessages(ANA, params({ conversationId: CONV_OTHER }))
      ).rejects.toThrow(ConversationNotFoundException);
      expect(fake.callsOf('search')).toEqual([]);
    });

    it('sem conversas → resposta vazia sem consultar Elasticsearch nem MongoDB', async () => {
      conversations.getUserConversationIds.mockResolvedValue([]);

      await expect(service.searchMessages(ANA, params())).resolves.toEqual({
        items: [],
        total: 0,
        facets: { conversations: [] },
        tookMs: 7,
      });
      expect(fake.calls).toEqual([]);
      expect(messages.findByIdsForSearch).not.toHaveBeenCalled();
    });

    it('hidratação descarta apagadas (não voltam do MongoDB) e conversas fora do conjunto permitido', async () => {
      fake.searchResponse = configuredResponse({
        hits: {
          total: { value: 3, relation: 'eq' },
          hits: [
            { _index: INDEX, _id: 'm1', _score: 3, highlight: { content: ['a'] } },
            { _index: INDEX, _id: 'apagada', _score: 2, highlight: { content: ['b'] } },
            { _index: INDEX, _id: 'm9', _score: 1, highlight: { content: ['c'] } },
          ],
        },
      });

      const result = await service.searchMessages(ANA, params());

      expect(result.items).toEqual([{ message: M1, highlights: ['a'], score: 3 }]);
      expect(result.total).toBe(3);
    });
  });

  it('from depois de to → 400, antes de qualquer consulta', async () => {
    await expect(service.searchMessages(ANA, params({ from: at(10), to: at(9) }))).rejects.toThrow(
      InvalidSearchRangeException
    );
    expect(conversations.getUserConversationIds).not.toHaveBeenCalled();
  });

  describe('Elasticsearch fora do ar', () => {
    it('→ 503 SearchUnavailableException, com log do erro original', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service.searchMessages(ANA, params())).rejects.toThrow(
        SearchUnavailableException
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Falha na consulta ao Elasticsearch',
        fake.failWith,
        { index: INDEX }
      );
      expect(messages.findByIdsForSearch).not.toHaveBeenCalled();
    });

    it('rejeição que não é Error também vira 503', async () => {
      jest.spyOn(fake, 'search').mockRejectedValue('timeout');

      await expect(service.searchMessages(ANA, params())).rejects.toThrow(
        SearchUnavailableException
      );
      expect(jest.mocked(logger.error).mock.calls[0]?.[1]).toEqual(new Error('timeout'));
    });
  });

  describe('formas da resposta do Elasticsearch', () => {
    it('highlight só no content.exact (stopword), sem highlight, sem _id, _score null, total numérico, sem agregações', async () => {
      fake.searchResponse = configuredResponse({
        hits: {
          total: 12,
          hits: [
            {
              _index: INDEX,
              _id: 'm1',
              _score: null,
              highlight: { 'content.exact': ['<mark>de</mark>'] },
            },
            { _index: INDEX, _id: 'm2' },
            { _index: INDEX },
          ],
        },
      });

      const result = await service.searchMessages(ANA, params());

      expect(result).toEqual({
        items: [
          { message: M1, highlights: ['<mark>de</mark>'], score: 0 },
          { message: M2, highlights: [], score: 0 },
        ],
        total: 12,
        facets: { conversations: [] },
        tookMs: 7,
      });
      expect(messages.findByIdsForSearch).toHaveBeenCalledWith(['m1', 'm2']);
    });

    it('total ausente vale 0', async () => {
      fake.searchResponse = configuredResponse({ hits: { hits: [] } });

      await expect(service.searchMessages(ANA, params())).resolves.toMatchObject({ total: 0 });
    });

    it('relógio padrão (performance.now) mede um tempo não negativo', async () => {
      const real = new SearchService({
        client: fake.client,
        index: INDEX,
        conversations,
        messages,
      });

      const { tookMs } = await real.searchMessages(ANA, params());

      expect(tookMs).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(tookMs)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/search/services/SearchService.test.ts --coverage=false`

Expected: FAIL — os 15 testes falham com `TypeError: services_1.SearchService is not a constructor` (o barrel `services` ainda não exporta o `SearchService`).

- [ ] **Step 3: Implementar**

Criar `src/modules/search/interfaces/ISearchService.ts`:

```ts
import type { MessageSearchResult, SearchMessagesParams } from '../types';

export interface ISearchService {
  /**
   * Busca full-text nas mensagens das conversas das quais `userId` participa no momento da
   * busca, em ordem de relevância (empate: mais recentes primeiro), com highlight e facetas.
   *
   * @throws InvalidSearchRangeException (400) — `from` depois de `to`
   * @throws ConversationNotFoundException (404) — `conversationId` de conversa da qual não participa
   * @throws SearchUnavailableException (503) — Elasticsearch fora do ar
   */
  searchMessages(userId: string, params: SearchMessagesParams): Promise<MessageSearchResult>;
}
```

Em `src/modules/search/interfaces/index.ts`, substituir:

```ts
export type { ISearchIndexService } from './ISearchIndexService';
```

por:

```ts
export type { ISearchIndexService } from './ISearchIndexService';
export type { ISearchService } from './ISearchService';
```

Criar `src/modules/search/services/SearchService.ts`:

```ts
import type { estypes } from '@elastic/elasticsearch';
import { ConversationNotFoundException } from '@/modules/chat/errors';
import type { IConversationService, IMessageService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { messageService } from '@/modules/chat/services/MessageService';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { logger } from '@/shared/logger';
import { SEARCH_CONSTANTS } from '../constants';
import { InvalidSearchRangeException, SearchUnavailableException } from '../errors';
import type { ISearchService } from '../interfaces';
import type {
  ConversationFacet,
  MessageSearchAggregations,
  MessageSearchHit,
  MessageSearchResult,
  SearchClient,
  SearchMessagesParams,
} from '../types';

export interface SearchServiceOptions {
  /** @default o cliente `elasticsearch` da aplicação */
  client?: SearchClient;
  /** @default SEARCH_CONSTANTS.MESSAGES_INDEX */
  index?: string;
  /** Conversas das quais o usuário participa hoje. @default conversationService */
  conversations?: Pick<IConversationService, 'getUserConversationIds'>;
  /** Hidratação no MongoDB. @default messageService */
  messages?: Pick<IMessageService, 'findByIdsForSearch'>;
  /** Relógio em ms para o `tookMs`. @default performance.now */
  now?: () => number;
}

type SearchResponse = estypes.SearchResponse<unknown, MessageSearchAggregations>;

const HIGHLIGHT_FIELD = {
  fragment_size: SEARCH_CONSTANTS.FRAGMENT_SIZE,
  number_of_fragments: SEARCH_CONSTANTS.MAX_FRAGMENTS,
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Total de acertos: objeto `{ value }` no Elasticsearch 8 (número em `rest_total_hits_as_int`). */
function countHits(total: SearchResponse['hits']['total']): number {
  return typeof total === 'number' ? total : (total?.value ?? 0);
}

/**
 * Busca de mensagens (RF006). Os resultados ficam restritos às conversas das quais o usuário
 * participa NO MOMENTO da busca (filtro `terms` no Elasticsearch e, de novo, na hidratação). O
 * texto devolvido vem do MongoDB (fonte da verdade): documento de mensagem apagada que ainda
 * esteja no índice é descartado.
 */
export class SearchService implements ISearchService {
  private readonly client: SearchClient;
  private readonly index: string;
  private readonly conversations: Pick<IConversationService, 'getUserConversationIds'>;
  private readonly messages: Pick<IMessageService, 'findByIdsForSearch'>;
  private readonly now: () => number;

  constructor({
    client = elasticsearch,
    index = SEARCH_CONSTANTS.MESSAGES_INDEX,
    conversations = conversationService,
    messages = messageService,
    now = performance.now.bind(performance),
  }: SearchServiceOptions = {}) {
    this.client = client;
    this.index = index;
    this.conversations = conversations;
    this.messages = messages;
    this.now = now;
  }

  async searchMessages(userId: string, params: SearchMessagesParams): Promise<MessageSearchResult> {
    const startedAt = this.now();
    if (
      params.from !== undefined &&
      params.to !== undefined &&
      params.from.getTime() > params.to.getTime()
    ) {
      throw new InvalidSearchRangeException();
    }

    const scope = await this.allowedConversations(userId, params.conversationId);
    if (scope.length === 0) {
      return this.result([], 0, [], startedAt);
    }

    const response = await this.query(scope, params);
    const items = await this.hydrate(response.hits.hits, new Set(scope));
    const facets =
      response.aggregations?.conversations.buckets.map((bucket) => ({
        conversationId: bucket.key,
        count: bucket.doc_count,
      })) ?? [];

    return this.result(items, countHits(response.hits.total), facets, startedAt);
  }

  /** Conversas do usuário hoje; com `conversationId`, só ela — ou 404 se ele não participa. */
  private async allowedConversations(userId: string, conversationId?: string): Promise<string[]> {
    const allowed = await this.conversations.getUserConversationIds(userId);
    if (conversationId === undefined) {
      return allowed;
    }
    // Mesma resposta de "conversa não existe": não revela conversas alheias.
    if (!allowed.includes(conversationId)) {
      throw new ConversationNotFoundException();
    }
    return [conversationId];
  }

  private filters(scope: string[], params: SearchMessagesParams): estypes.QueryDslQueryContainer[] {
    const filters: estypes.QueryDslQueryContainer[] = [{ terms: { conversationId: scope } }];
    if (params.senderId !== undefined) {
      filters.push({ term: { senderId: params.senderId } });
    }
    if (params.from !== undefined || params.to !== undefined) {
      filters.push({
        range: {
          createdAt: { gte: params.from?.toISOString(), lte: params.to?.toISOString() },
        },
      });
    }
    return filters;
  }

  private async query(scope: string[], params: SearchMessagesParams): Promise<SearchResponse> {
    try {
      return await this.client.search({
        index: this.index,
        size: params.limit,
        // O texto vem do MongoDB (hidratação); do índice só precisamos de ids, score e highlight.
        _source: false,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: params.q,
                  type: 'most_fields',
                  // A forma exata da palavra (sem stemmer) pesa o dobro.
                  fields: ['content', 'content.exact^2'],
                },
              },
            ],
            filter: this.filters(scope, params),
          },
        },
        sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
        highlight: {
          // O texto do usuário volta escapado para HTML; só as tags <mark> ficam cruas.
          encoder: 'html',
          pre_tags: [SEARCH_CONSTANTS.HIGHLIGHT_PRE_TAG],
          post_tags: [SEARCH_CONSTANTS.HIGHLIGHT_POST_TAG],
          fields: { content: HIGHLIGHT_FIELD, 'content.exact': HIGHLIGHT_FIELD },
        },
        aggs: {
          conversations: {
            terms: { field: 'conversationId', size: SEARCH_CONSTANTS.FACET_SIZE },
          },
        },
      });
    } catch (error) {
      logger.error('Falha na consulta ao Elasticsearch', toError(error), { index: this.index });
      throw new SearchUnavailableException();
    }
  }

  /**
   * Busca as mensagens no MongoDB e monta os itens na ordem do Elasticsearch, descartando as
   * que não voltaram (apagadas) e as de conversas fora do conjunto permitido.
   */
  private async hydrate(
    hits: SearchResponse['hits']['hits'],
    scope: Set<string>
  ): Promise<MessageSearchHit[]> {
    const found = hits.flatMap((hit) => (hit._id === undefined ? [] : [{ id: hit._id, hit }]));
    const messages = await this.messages.findByIdsForSearch(found.map(({ id }) => id));
    const byId = new Map(messages.map((message) => [message.id, message]));

    return found.flatMap(({ id, hit }) => {
      const message = byId.get(id);
      if (message === undefined || !scope.has(message.conversationId)) {
        return [];
      }
      return [
        {
          message,
          // `content` (com stemmer) ou, se o acerto veio só da forma exata, `content.exact`.
          highlights: hit.highlight?.content ?? hit.highlight?.['content.exact'] ?? [],
          score: hit._score ?? 0,
        },
      ];
    });
  }

  private result(
    items: MessageSearchHit[],
    total: number,
    conversations: ConversationFacet[],
    startedAt: number
  ): MessageSearchResult {
    return {
      items,
      total,
      facets: { conversations },
      tookMs: Math.round(this.now() - startedAt),
    };
  }
}

export const searchService = new SearchService();
```

Em `src/modules/search/services/index.ts`, substituir:

```ts
export { SearchIndexService, searchIndexService } from './SearchIndexService';
export type { SearchIndexServiceOptions } from './SearchIndexService';
```

por:

```ts
export { SearchIndexService, searchIndexService } from './SearchIndexService';
export type { SearchIndexServiceOptions } from './SearchIndexService';
export { SearchService, searchService } from './SearchService';
export type { SearchServiceOptions } from './SearchService';
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/search/services --coverage=false`

Expected: PASS (31 testes nas duas suítes).

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/search/interfaces/ISearchService.ts src/modules/search/interfaces/index.ts src/modules/search/services/SearchService.ts src/modules/search/services/index.ts tests/unit/modules/search/services/SearchService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/search/interfaces/ISearchService.ts \
  src/modules/search/interfaces/index.ts \
  src/modules/search/services/SearchService.ts \
  src/modules/search/services/index.ts \
  tests/unit/modules/search/services/SearchService.test.ts
git commit -m "✨ feat: SearchService com filtros, highlight, facetas e hidratação restrita às conversas do usuário"
```


---

### Task 7: `GET /api/search/messages` — controller, rotas com rate limit próprio e barrel

**Files:**
- Modify: `src/app.ts`
- Create: `src/modules/search/controllers/SearchController.ts`
- Create: `src/modules/search/controllers/index.ts`
- Create: `src/modules/search/index.ts`
- Create: `src/modules/search/routes/index.ts`
- Create: `src/modules/search/routes/search.routes.ts`
- Modify: `tests/unit/app.test.ts`
- Create: `tests/unit/modules/search/controllers/SearchController.test.ts`
- Create: `tests/unit/modules/search/index.test.ts`
- Create: `tests/unit/modules/search/routes/search.routes.test.ts`

**Interfaces:**
- Consumes: `ISearchService`, `searchService` (Task 6); `searchMessagesQuerySchema` e `SEARCH_CONSTANTS` (Task 2); `createRateLimiter` (`@/shared/middlewares/rateLimiter`); `authenticate`/`asyncHandler` (`@/modules/auth/middlewares`); `getAuthenticatedUserId`/`sendValidationError` (`@/shared/http/controller.helpers`).
- Produces: `SearchController` (`constructor(search?: ISearchService)`, `searchMessages(req, res)`) e `searchController` (`@/modules/search/controllers`).
- Produces: `createSearchRateLimiter(): RequestHandler`, `createSearchRoutes(controller = searchController, limiter = createSearchRateLimiter()): Router` e `searchRoutes` (`@/modules/search/routes`); montado em `app.use('/api/search', searchRoutes)`.
- Produces: barrel `@/modules/search` (constantes, erros, tipos, interfaces, validação, services e singletons, `registerSearchIndexListeners`, controller e rotas).

Resposta no envelope do projeto (`{ success: true, data }`); validação 400 no formato do `sendValidationError`. Ordem da rota: `authenticate` → limiter → controller (decisão 10). O `app.test.ts` passa a mockar `@/shared/database/elasticsearch` (o cliente da aplicação nunca é usado ali).

- [ ] **Step 1: Escrever os testes (falham hoje)**

Criar `tests/unit/modules/search/controllers/SearchController.test.ts`:

```ts
jest.mock('@/modules/search/services/SearchService', () => ({ searchService: {} }));

import type { Request, Response } from 'express';
import { SearchController } from '@/modules/search/controllers/SearchController';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: ANA, email: 'ana@example.com', username: 'ana' },
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('SearchController', () => {
  let search: { searchMessages: jest.Mock };
  let controller: SearchController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    search = { searchMessages: jest.fn() };
    controller = new SearchController(search);
    res = createRes();
  });

  it('usa o searchService padrão quando nenhum é injetado', () => {
    expect(new SearchController()).toBeInstanceOf(SearchController);
  });

  it('valida a query e responde { success, data } com o resultado da busca', async () => {
    const result = { items: [], total: 0, facets: { conversations: [] }, tookMs: 3 };
    search.searchMessages.mockResolvedValue(result);

    await controller.searchMessages(
      createReq({
        query: { q: ' coração ', conversationId: CONVERSATION, from: '2026-09-27T00:00:00Z' },
      }),
      res
    );

    expect(search.searchMessages).toHaveBeenCalledWith(ANA, {
      q: 'coração',
      conversationId: CONVERSATION,
      from: new Date('2026-09-27T00:00:00.000Z'),
      limit: 20,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('query inválida → 400 no formato do projeto, sem chamar o service', async () => {
    await controller.searchMessages(createReq({ query: { q: '', limit: '500' } }), res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Dados inválidos',
      errors: expect.arrayContaining([
        expect.objectContaining({ path: ['q'], message: 'q não pode estar vazio' }),
        expect.objectContaining({ path: ['limit'], message: 'limit deve estar entre 1 e 100' }),
      ]),
    });
    expect(search.searchMessages).not.toHaveBeenCalled();
  });

  it('sem usuário autenticado → UnauthorizedError', async () => {
    await expect(controller.searchMessages(createReq({ user: undefined }), res)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('erros do service propagam (o errorHandler responde)', async () => {
    search.searchMessages.mockRejectedValue(new Error('boom'));

    await expect(controller.searchMessages(createReq({ query: { q: 'x' } }), res)).rejects.toThrow(
      'boom'
    );
  });
});
```

Criar `tests/unit/modules/search/routes/search.routes.test.ts`:

```ts
jest.mock('@/modules/search/controllers/SearchController', () => ({
  searchController: { searchMessages: jest.fn() },
}));

// Funções simples (não jest.fn com implementação): resetMocks apagaria a implementação antes
// dos testes que montam rotas novas.
jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  },
  asyncHandler: (fn: unknown): unknown => fn,
}));

import express, { type Router } from 'express';
import request from 'supertest';
import { authenticate } from '@/modules/auth/middlewares';
import { searchController } from '@/modules/search/controllers/SearchController';
import { createSearchRateLimiter, createSearchRoutes, searchRoutes } from '@/modules/search/routes';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function routesOf(router: Router): Array<{ path: string; method: string; layer: Layer }> {
  return (router.stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('search.routes', () => {
  it('define só GET /messages: authenticate → rate limit → controller', async () => {
    const routes = routesOf(searchRoutes as Router);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual(['GET /messages']);
    const stack = routes[0]!.layer.route!.stack;
    expect(stack).toHaveLength(3);
    expect(stack[0]!.handle).toBe(authenticate);

    const req = {};
    const res = {};
    await stack[2]!.handle(req, res);
    expect(searchController.searchMessages).toHaveBeenCalledWith(req, res);
  });

  it('aceita controller e limiter injetados', async () => {
    const controller = { searchMessages: jest.fn() };
    const limiter = jest.fn();

    const stack = routesOf(createSearchRoutes(controller, limiter))[0]!.layer.route!.stack;
    await stack[2]!.handle('req', 'res');

    expect(stack[1]!.handle).toBe(limiter);
    expect(controller.searchMessages).toHaveBeenCalledWith('req', 'res');
  });

  it('rate limit próprio: 30 buscas por minuto por IP; a 31ª recebe 429 no formato do projeto', async () => {
    const controller = {
      searchMessages: async (_req: unknown, res: express.Response): Promise<void> => {
        res.status(200).json({ success: true });
      },
    };
    const app = express();
    app.use('/api/search', createSearchRoutes(controller, createSearchRateLimiter()));

    for (let i = 0; i < 30; i++) {
      const ok = await request(app).get('/api/search/messages?q=x');
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).get('/api/search/messages?q=x');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many search requests, please try again later',
        statusCode: 429,
      },
    });
    expect(limited.headers['ratelimit-limit']).toBe('30');
  });
});
```

Criar `tests/unit/modules/search/index.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));

import * as searchModule from '@/modules/search';

describe('search module index', () => {
  it('deve exportar constantes, erros e validação', () => {
    expect(searchModule.SEARCH_CONSTANTS.MAX_LIMIT).toBe(100);
    expect(searchModule.resolveMessagesIndex({})).toBe('messages');
    expect(searchModule.MESSAGES_INDEX_SETTINGS).toBeDefined();
    expect(searchModule.MESSAGES_INDEX_MAPPINGS).toBeDefined();
    expect(new searchModule.SearchUnavailableException().statusCode).toBe(503);
    expect(new searchModule.InvalidSearchRangeException().statusCode).toBe(400);
    expect(searchModule.searchMessagesQuerySchema).toBeDefined();
  });

  it('deve exportar os services e as instâncias padrão', () => {
    expect(searchModule.searchIndexService).toBeInstanceOf(searchModule.SearchIndexService);
    expect(searchModule.searchService).toBeInstanceOf(searchModule.SearchService);
  });

  it('deve exportar o MessageIndexer, o controller e as rotas', () => {
    expect(searchModule.registerSearchIndexListeners).toBeInstanceOf(Function);
    expect(searchModule.searchController).toBeInstanceOf(searchModule.SearchController);
    expect(searchModule.searchRoutes).toBeDefined();
    expect(searchModule.createSearchRoutes).toBeInstanceOf(Function);
    expect(searchModule.createSearchRateLimiter).toBeInstanceOf(Function);
  });
});
```

Em `tests/unit/app.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  },
}));

jest.mock('jsonwebtoken', () => ({
```

por:

```ts
  },
}));

// O cliente Elasticsearch da aplicação nunca é usado aqui (busca sem token → 401).
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));

jest.mock('jsonwebtoken', () => ({
```

2. Substituir:

```ts
    it('monta o router de presença em /api/presence (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/presence?userIds=x');

      expect(response.status).toBe(401);
```

por:

```ts
    it('monta o router de presença em /api/presence (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/presence?userIds=x');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('monta o router de busca em /api/search (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/search/messages?q=oi');

      expect(response.status).toBe(401);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/search/controllers tests/unit/modules/search/routes tests/unit/modules/search/index.test.ts tests/unit/app.test.ts --coverage=false`

Expected: FAIL — as suítes de controller e rotas não carregam (`Could not locate module @/modules/search/controllers/SearchController`), a do barrel também (`Could not locate module @/modules/search`), e no `app.test.ts` "monta o router de busca em /api/search" falha com `Expected: 401` / `Received: 404`.

- [ ] **Step 3: Implementar**

Criar `src/modules/search/controllers/SearchController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { ISearchService } from '../interfaces';
import { searchService } from '../services/SearchService';
import { searchMessagesQuerySchema } from '../validation';

export class SearchController {
  private readonly search: ISearchService;

  constructor(search?: ISearchService) {
    this.search = search ?? searchService;
  }

  /**
   * `GET /api/search/messages?q=&conversationId=&senderId=&from=&to=&limit=` →
   * `{ items, total, facets: { conversations }, tookMs }`.
   */
  async searchMessages(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = searchMessagesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const result = await this.search.searchMessages(userId, parsed.data);

    res.status(HttpStatus.OK).json({ success: true, data: result });
  }
}

export const searchController = new SearchController();
```

Criar `src/modules/search/controllers/index.ts`:

```ts
export { SearchController, searchController } from './SearchController';
```

Criar `src/modules/search/routes/search.routes.ts`:

```ts
import { Router, type RequestHandler } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { createRateLimiter } from '@/shared/middlewares/rateLimiter';
import { SEARCH_CONSTANTS } from '../constants';
import { searchController, type SearchController } from '../controllers/SearchController';

/** Rate limit próprio da busca: 30 requisições por minuto por IP (chave padrão do projeto). */
export function createSearchRateLimiter(): RequestHandler {
  return createRateLimiter({
    windowMs: SEARCH_CONSTANTS.RATE_LIMIT_WINDOW_MS,
    max: SEARCH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
    keyPrefix: SEARCH_CONSTANTS.RATE_LIMIT_KEY_PREFIX,
    message: 'Too many search requests, please try again later',
  });
}

/** Rotas da busca; os parâmetros existem para os testes (limiter novo = contagem zerada). */
export function createSearchRoutes(
  controller: Pick<SearchController, 'searchMessages'> = searchController,
  limiter: RequestHandler = createSearchRateLimiter()
): Router {
  const router = Router();

  /**
   * @route GET /search/messages?q=&conversationId=&senderId=&from=&to=&limit=
   * @description Busca full-text nas mensagens das conversas do usuário (até 100 resultados)
   * @access Private
   */
  router.get(
    '/messages',
    authenticate,
    limiter,
    asyncHandler((req, res) => controller.searchMessages(req, res))
  );

  return router;
}

export const searchRoutes = createSearchRoutes();
```

Criar `src/modules/search/routes/index.ts`:

```ts
export { createSearchRateLimiter, createSearchRoutes, searchRoutes } from './search.routes';
```

Criar `src/modules/search/index.ts`:

```ts
export * from './constants';

export * from './errors';

export * from './types';

export * from './interfaces';

export * from './validation';

export { SearchIndexService, searchIndexService, SearchService, searchService } from './services';
export type { SearchIndexServiceOptions, SearchServiceOptions } from './services';

export { registerSearchIndexListeners } from './listeners';

export { SearchController, searchController } from './controllers';

export { createSearchRateLimiter, createSearchRoutes, searchRoutes } from './routes';
```

Em `src/app.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import { conversationRoutes } from './modules/chat/routes';
import { presenceRoutes } from './modules/presence/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
```

por:

```ts
import { conversationRoutes } from './modules/chat/routes';
import { presenceRoutes } from './modules/presence/routes';
import { searchRoutes } from './modules/search/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
```

2. Substituir:

```ts
app.use('/api/conversations', conversationRoutes);
app.use('/api/presence', presenceRoutes);

app.use(notFoundHandler);
```

por:

```ts
app.use('/api/conversations', conversationRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/search', searchRoutes);

app.use(notFoundHandler);
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/search tests/unit/app.test.ts --coverage=false`

Expected: PASS (inclusive a 31ª busca do mesmo IP no mesmo minuto → 429 `RATE_LIMITED` "Too many search requests, please try again later").

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/app.ts src/modules/search/controllers/SearchController.ts src/modules/search/controllers/index.ts src/modules/search/index.ts src/modules/search/routes/index.ts src/modules/search/routes/search.routes.ts tests/unit/app.test.ts tests/unit/modules/search/controllers/SearchController.test.ts tests/unit/modules/search/index.test.ts tests/unit/modules/search/routes/search.routes.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts \
  src/modules/search/controllers/SearchController.ts \
  src/modules/search/controllers/index.ts \
  src/modules/search/index.ts \
  src/modules/search/routes/index.ts \
  src/modules/search/routes/search.routes.ts \
  tests/unit/app.test.ts \
  tests/unit/modules/search/controllers/SearchController.test.ts \
  tests/unit/modules/search/index.test.ts \
  tests/unit/modules/search/routes/search.routes.test.ts
git commit -m "✨ feat: GET /api/search/messages com rate limit próprio"
```


---

### Task 8: Busca ponta a ponta (feature test com o chat em memória)

**Files:**
- Create: `tests/feature/modules/search/search.test.ts`

**Interfaces:**
- Consumes: rotas do chat com os repositórios em memória (`createInMemoryChatRepositories`, com `findActiveByIds`/`findPageAfter` da Task 1), `registerChatCacheListeners`, `registerSearchIndexListeners()` e `searchIndexService` padrão (Task 5), `createSearchRoutes()` (Task 7), `FakeSearchClient` (Task 3) como o `elasticsearch` da aplicação (mock de `@/shared/database/elasticsearch`), `FakeRedis`.

Sem código de produção: prova as peças juntas pelo HTTP — enviar pelo chat indexa (subscribers assíncronos), buscar com e sem acento (no fake: palavra sem acento/caixa), highlight escapado, facetas, isolamento por participação **no momento da busca** (removida do grupo, a Carol deixa de ver), conversa alheia no filtro → 404, apagar remove da busca, documento "ressuscitado" descartado na hidratação, filtros/limit, validação e Elasticsearch fora → 503 com o chat funcionando. As rotas da busca são recriadas a cada teste (rate limit zerado).

- [ ] **Step 1: Escrever o teste**

Criar `tests/feature/modules/search/search.test.ts`:

```ts
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

// Fronteira do módulo user com estado em memória (funções simples: resetMocks apagaria jest.fn).
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
const mockUserService = {
  exists: async (id: string): Promise<boolean> => mockUsers.has(id),
  getMultiple: async (ids: string[]): Promise<unknown[]> =>
    ids
      .filter((id) => mockUsers.has(id))
      .map((id) => ({
        id,
        username: `user_${id.slice(0, 4)}`,
        displayName: null,
        avatarUrl: null,
      })),
};
const mockContactService = {
  isBlockedByEither: async (): Promise<boolean> => false,
  recordInteraction: async (): Promise<void> => undefined,
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
// Cache de participantes num Redis em memória (nunca o Redis real da máquina).
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
// O cliente Elasticsearch da aplicação é o fake: os services padrão da busca o usam.
jest.mock('@/shared/database/elasticsearch', () => {
  const { FakeSearchClient } = jest.requireActual(
    '../../../support/elasticsearch/fakeSearchClient'
  );
  return { elasticsearch: new FakeSearchClient() };
});
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // O token do teste é o próprio id do usuário: "Authorization: Bearer <uuid>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header === undefined) {
      const errors = jest.requireActual('@/shared/errors');
      next(
        new errors.AppError(
          'Token de autenticação não fornecido',
          errors.HttpStatus.UNAUTHORIZED,
          errors.ErrorCode.UNAUTHORIZED
        )
      );
      return;
    }
    const id = header.replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import { registerChatCacheListeners } from '@/modules/chat/listeners';
import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { registerSearchIndexListeners } from '@/modules/search/listeners';
import { createSearchRoutes } from '@/modules/search/routes';
import { searchIndexService } from '@/modules/search/services';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { redis } from '@/shared/database/redis';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';
import type { FakeSearchClient } from '../../../support/elasticsearch/fakeSearchClient';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const fakeEs = elasticsearch as unknown as FakeSearchClient;
const fakeRedis = redis as unknown as FakeRedis;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });

/** A indexação roda em subscribers `{ async: true }` (setImmediate depois do publish). */
async function flushIndexing(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

interface SearchItem {
  message: { id: string; conversationId: string; senderId: string; content: { text: string } };
  highlights: string[];
  score: number;
}

describe('Busca de mensagens — Feature', () => {
  let app: Application;
  let unregister: Array<() => void>;

  beforeAll(() => {
    // Em produção o bootstrap registra estes listeners; aqui o teste faz o mesmo.
    unregister = [registerChatCacheListeners(), registerSearchIndexListeners()];
  });

  afterAll(() => {
    unregister.forEach((fn) => {
      fn();
    });
  });

  beforeEach(async () => {
    store.reset();
    fakeRedis.flushall();
    fakeEs.reset();
    await searchIndexService.ensureIndex();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    // Rotas novas a cada teste: o rate limit (30/min) recomeça do zero.
    app.use('/api/search', createSearchRoutes());
    app.use(errorHandler);
  });

  async function direct(from: string, to: string): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/direct')
      .set(as(from))
      .send({ userId: to });
    return (response.body as { data: { id: string } }).data.id;
  }

  async function group(from: string, members: string[]): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/group')
      .set(as(from))
      .send({ name: 'Equipe', participantIds: members });
    return (response.body as { data: { id: string } }).data.id;
  }

  async function send(from: string, conversationId: string, text: string): Promise<string> {
    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(as(from))
      .send({ text });
    expect(response.status).toBe(201);
    return (response.body as { data: { id: string } }).data.id;
  }

  async function search(userId: string, query: Record<string, string>): Promise<request.Response> {
    await flushIndexing();
    return request(app).get('/api/search/messages').query(query).set(as(userId));
  }

  function ids(response: request.Response): string[] {
    return (response.body as { data: { items: SearchItem[] } }).data.items.map(
      (item) => item.message.id
    );
  }

  it('sem token → 401', async () => {
    const response = await request(app).get('/api/search/messages?q=oi');

    expect(response.status).toBe(401);
  });

  it('mensagem enviada é indexada e encontrada com e sem acento, com highlight escapado e facetas', async () => {
    const conversation = await direct(ANA, BOB);
    const first = await send(ANA, conversation, 'Meu coração está <b>feliz</b>');
    const second = await send(BOB, conversation, 'coracao sem acento');

    const withAccent = await search(ANA, { q: 'coração' });
    const withoutAccent = await search(BOB, { q: 'CORACAO' });

    expect(withAccent.status).toBe(200);
    expect(withAccent.body).toEqual({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            message: expect.objectContaining({
              id: second,
              conversationId: conversation,
              senderId: BOB,
              content: { type: 'text', text: 'coracao sem acento' },
            }),
            highlights: ['<mark>coracao</mark> sem acento'],
            score: 1,
          }),
          expect.objectContaining({
            message: expect.objectContaining({ id: first, senderId: ANA }),
            highlights: ['Meu <mark>coração</mark> está &lt;b&gt;feliz&lt;&#x2F;b&gt;'],
          }),
        ],
        total: 2,
        facets: { conversations: [{ conversationId: conversation, count: 2 }] },
        tookMs: expect.any(Number),
      },
    });
    expect(ids(withoutAccent)).toEqual([second, first]);
  });

  it('só as conversas das quais o usuário participa no momento da busca', async () => {
    const anaBob = await direct(ANA, BOB);
    const team = await group(ANA, [CAROL]);
    const secret = await send(ANA, anaBob, 'reunião secreta');
    const open = await send(ANA, team, 'reunião da equipe');

    // Carol só vê a do grupo; Dave, sem conversas, não vê nada (e o ES nem é consultado).
    expect(ids(await search(CAROL, { q: 'reunião' }))).toEqual([open]);
    fakeEs.calls.length = 0;
    const dave = await search(DAVE, { q: 'reunião' });
    expect(dave.body.data).toEqual({
      items: [],
      total: 0,
      facets: { conversations: [] },
      tookMs: expect.any(Number),
    });
    expect(fakeEs.callsOf('search')).toEqual([]);

    // Conversa alheia no filtro → 404, igual a "não existe".
    const foreign = await search(CAROL, { q: 'reunião', conversationId: anaBob });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('NOT_FOUND');

    // Removida do grupo, Carol deixa de ver as mensagens dele.
    await request(app).delete(`/api/conversations/${team}/members/${CAROL}`).set(as(ANA));
    expect(ids(await search(CAROL, { q: 'reunião' }))).toEqual([]);
    expect(ids(await search(ANA, { q: 'reunião' })).sort()).toEqual([open, secret].sort());
  });

  it('apagar remove da busca; documento "ressuscitado" no índice é descartado na hidratação', async () => {
    const conversation = await direct(ANA, BOB);
    const kept = await send(ANA, conversation, 'pão de queijo');
    const removed = await send(ANA, conversation, 'pão francês');

    const deleted = await request(app)
      .delete(`/api/conversations/${conversation}/messages/${removed}`)
      .set(as(ANA));
    expect(deleted.status).toBe(204);
    expect(ids(await search(BOB, { q: 'pão' }))).toEqual([kept]);

    // Corrida delete-antes-do-index: o documento volta ao índice, mas a busca não o mostra.
    await fakeEs.index({
      index: 'messages',
      id: removed,
      document: {
        messageId: removed,
        conversationId: conversation,
        senderId: ANA,
        content: 'pão francês',
        createdAt: new Date().toISOString(),
      },
    });
    const response = await search(BOB, { q: 'pão' });
    expect(ids(response)).toEqual([kept]);
    expect(response.body.data.total).toBe(2);
  });

  it('filtros por conversa, autor e período, e limit', async () => {
    const anaBob = await direct(ANA, BOB);
    const team = await group(ANA, [BOB]);
    const a1 = await send(ANA, anaBob, 'viagem marcada');
    const b1 = await send(BOB, anaBob, 'viagem confirmada');
    const t1 = await send(BOB, team, 'viagem da equipe');
    const [, createdB1, createdT1] = store.messages.map((message) => message.createdAt);

    expect(ids(await search(ANA, { q: 'viagem', conversationId: team }))).toEqual([t1]);
    expect(ids(await search(ANA, { q: 'viagem', senderId: BOB }))).toEqual([t1, b1]);
    expect(
      ids(
        await search(ANA, {
          q: 'viagem',
          from: createdB1!.toISOString(),
          to: createdT1!.toISOString(),
        })
      )
    ).toEqual([t1, b1]);
    expect(ids(await search(ANA, { q: 'viagem', limit: '1' }))).toEqual([t1]);
    expect(ids(await search(ANA, { q: 'viagem' }))).toEqual([t1, b1, a1]);
  });

  it('validação: q obrigatório, limit até 100, from ≤ to', async () => {
    const missing = await search(ANA, {});
    const tooMany = await search(ANA, { q: 'x', limit: '101' });
    const inverted = await search(ANA, {
      q: 'x',
      from: '2026-09-28T00:00:00Z',
      to: '2026-09-27T00:00:00Z',
    });

    expect(missing.status).toBe(400);
    expect(missing.body.errors[0].message).toBe('q é obrigatório');
    expect(tooMany.status).toBe(400);
    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Período inválido: "from" deve ser anterior ou igual a "to"',
    });
  });

  it('Elasticsearch fora do ar: busca → 503 SEARCH_UNAVAILABLE; o chat segue funcionando', async () => {
    const conversation = await direct(ANA, BOB);
    fakeEs.failWith = new Error('connect ECONNREFUSED');

    await send(ANA, conversation, 'ainda envio mensagens');
    const response = await search(ANA, { q: 'mensagens' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: 'SEARCH_UNAVAILABLE',
      message: 'Busca indisponível no momento; tente novamente mais tarde',
    });
  });
});
```

- [ ] **Step 2: Rodar (passa direto) e provar que não é vácuo**

Run: `node node_modules/.bin/jest tests/feature/modules/search --coverage=false`

Expected: PASS (7 testes). Para provar que o teste depende do MessageIndexer: troque temporariamente, no `beforeAll`, `unregister = [registerChatCacheListeners(), registerSearchIndexListeners()];` por `unregister = [registerChatCacheListeners()]; void registerSearchIndexListeners;` e rode de novo — 4 testes falham (os que buscam mensagens enviadas). Desfaça a troca e confirme PASS de novo.

- [ ] **Step 3: Estabilidade**

Run (3 vezes): `node node_modules/.bin/jest tests/feature/modules/search --coverage=false`

Expected: PASS nas três.

- [ ] **Step 4: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/feature/modules/search/search.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 5: Commit**

```bash
git add tests/feature/modules/search/search.test.ts
git commit -m "✅ test: busca de mensagens ponta a ponta com o chat em memória"
```


---

### Task 9: Integração opcional com Elasticsearch real (analyzer, highlight e consultas)

**Files:**
- Create: `tests/integration/search/elasticsearch.int.test.ts`

**Interfaces:**
- Consumes: `SearchIndexService` e `SearchService` (Tasks 4 e 6) sobre um `Client` real do `@elastic/elasticsearch` apontado para `ELASTICSEARCH_IT_URL`; índice descartável `messages-it-<hex>` apagado no `afterAll`.

Prova o que o fake não reproduz (spec §5 e §7): o analyzer (`indices.analyze`: "coração", "coracao", "CORAÇÕES", "corações", "Coracoes" → o mesmo termo; reunião/reuniões; ação/ações), a busca nas quatro formas com `tookMs < 300`, a forma exata pesando mais, o highlight com `<script>` escapado, o fallback do highlight para `content.exact` (stopword), os filtros, o mapping `strict`, o `delete` idempotente e o reindex (remove apagadas, reindexa o que só saiu do índice, `--recreate`). Sem a variável, a suíte aparece como pulada (`describe.skip`) — nunca roda no CI nem na suíte normal. Arquivo de teste: não afeta a cobertura de `src`.

- [ ] **Step 1: Escrever o teste**

Criar `tests/integration/search/elasticsearch.int.test.ts`:

```ts
// Integração OPCIONAL com um Elasticsearch de verdade: só roda com ELASTICSEARCH_IT_URL definido
// (ex.: http://localhost:19200 ou http://elastic:<senha>@localhost:9201). Fora disso a suíte é
// pulada — o CI e a suíte normal nunca abrem conexão com um Elasticsearch. Prova o que o
// FakeSearchClient não reproduz: o analyzer pt_folded (acentos, caixa, plural e stemmer), o
// highlight escapado, o mapping strict e as consultas exatas do SearchService.
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { randomBytes } from 'crypto';
import { Client } from '@elastic/elasticsearch';
import type { IndexableMessage, MessageDTO } from '@/modules/chat/types';
import { SearchIndexService, SearchService } from '@/modules/search/services';
import type { SearchClient, SearchMessagesParams } from '@/modules/search/types';

const URL = process.env.ELASTICSEARCH_IT_URL;
const describeWithEs = URL !== undefined && URL !== '' ? describe : describe.skip;

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CONV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BASE = Date.parse('2026-09-27T10:00:00.000Z');

function message(
  id: string,
  conversationId: string,
  senderId: string,
  text: string | null,
  minutes: number
): IndexableMessage {
  return { id, conversationId, senderId, text, createdAt: new Date(BASE + minutes * 60_000) };
}

function toDto(item: IndexableMessage): MessageDTO {
  return {
    id: item.id,
    conversationId: item.conversationId,
    senderId: item.senderId,
    content: item.text === null ? null : { type: 'text', text: item.text },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: item.createdAt, deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
  };
}

const ALL = [
  message('m1', CONV_A, ANA, 'Meu coração está feliz', 0),
  message('m2', CONV_A, BOB, 'CORAÇÕES partidos <script>alert(1)</script>', 10),
  message('m3', CONV_B, ANA, 'coracao sem acento; reunião amanhã de manhã', 20),
  message('m4', CONV_OTHER, BOB, 'coração de outra conversa', 30),
  message('m5', CONV_A, ANA, 'mensagem apagada sobre coração', 40),
  message('m6', CONV_B, BOB, 'as reuniões e as ações da semana', 50),
];

describeWithEs('Elasticsearch real (opcional: ELASTICSEARCH_IT_URL)', () => {
  const index = `messages-it-${randomBytes(4).toString('hex')}`;
  let raw: Client;
  let indexer: SearchIndexService;
  let search: SearchService;
  let current: IndexableMessage[];

  async function tokens(text: string): Promise<string[]> {
    const response = await raw.indices.analyze({ index, analyzer: 'pt_folded', text });
    return (response.tokens ?? []).map((token) => token.token);
  }

  async function run(q: string, extra: Partial<SearchMessagesParams> = {}) {
    return search.searchMessages(ANA, { q, limit: 20, ...extra });
  }

  beforeAll(async () => {
    raw = new Client({ node: URL as string });
    const client = raw as unknown as SearchClient;
    current = [...ALL];
    const messages = {
      forEachForIndexing: async (
        batchSize: number,
        handler: (batch: IndexableMessage[]) => Promise<void>
      ): Promise<number> => {
        for (let start = 0; start < current.length; start += batchSize) {
          await handler(current.slice(start, start + batchSize));
        }
        return current.length;
      },
      findByIdsForSearch: async (ids: string[]): Promise<MessageDTO[]> =>
        current.filter((item) => ids.includes(item.id) && item.text !== null).map(toDto),
    };
    indexer = new SearchIndexService({ client, index, messages, batchSize: 4 });
    search = new SearchService({
      client,
      index,
      messages,
      conversations: { getUserConversationIds: async () => [CONV_A, CONV_B] },
    });

    await expect(indexer.ensureIndex()).resolves.toBe(true);
    await expect(indexer.ensureIndex()).resolves.toBe(false);
    await expect(indexer.reindexAll()).resolves.toEqual({
      scanned: 6,
      indexed: 6,
      deleted: 0,
      failed: 0,
    });
    await raw.indices.refresh({ index });
  });

  afterAll(async () => {
    await raw.indices.delete({ index, ignore_unavailable: true });
    await raw.close();
  });

  it('analyzer: "coração", "coracao", "CORAÇÕES" e "corações" viram o mesmo termo', async () => {
    const forms = ['coração', 'coracao', 'CORAÇÕES', 'corações', 'Coracoes'];
    const analyzed = await Promise.all(forms.map((form) => tokens(form)));

    expect(new Set(analyzed.map((list) => list.join(' '))).size).toBe(1);
    expect(await tokens('reunião')).toEqual(await tokens('reuniões'));
    expect(await tokens('ação')).toEqual(await tokens('ações'));
  });

  it.each(['coração', 'coracao', 'CORAÇÕES', 'corações'])(
    'busca "%s" encontra todas as formas, só nas conversas permitidas',
    async (q) => {
      const result = await run(q);

      expect(result.items.map((item) => item.message.id).sort()).toEqual(['m1', 'm2', 'm3', 'm5']);
      expect(result.total).toBe(4);
      expect(result.facets.conversations).toEqual([
        { conversationId: CONV_A, count: 3 },
        { conversationId: CONV_B, count: 1 },
      ]);
      expect(result.tookMs).toBeLessThan(300);
    }
  );

  it('forma exata pesa mais: "CORAÇÕES" põe m2 primeiro; highlight com <mark> e HTML escapado', async () => {
    const result = await run('CORAÇÕES');

    expect(result.items[0]?.message.id).toBe('m2');
    expect(result.items[0]?.highlights).toEqual([
      '<mark>CORAÇÕES</mark> partidos &lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
    ]);
    expect(result.items[0]?.score).toBeGreaterThan(result.items[1]?.score ?? Infinity);
  });

  it('plural e acento no meio da frase: "reuniao" acha "reunião" e "reuniões"', async () => {
    const result = await run('reuniao');

    expect(result.items.map((item) => item.message.id)).toEqual(
      expect.arrayContaining(['m3', 'm6'])
    );
    expect(result.items.find((item) => item.message.id === 'm6')?.highlights).toEqual([
      'as <mark>reuniões</mark> e as ações da semana',
    ]);
  });

  it('stopword só casa pela forma exata: highlight vem de content.exact', async () => {
    const result = await run('de');

    expect(result.items.map((item) => item.message.id)).toEqual(['m3']);
    expect(result.items[0]?.highlights).toEqual([
      'coracao sem acento; reunião amanhã <mark>de</mark> manhã',
    ]);
  });

  it('filtros por conversa, autor e período', async () => {
    const byConversation = await run('coração', { conversationId: CONV_B });
    const bySender = await run('coração', { senderId: BOB });
    const byPeriod = await run('coração', {
      from: new Date(BASE + 5 * 60_000),
      to: new Date(BASE + 25 * 60_000),
    });

    expect(byConversation.items.map((item) => item.message.id)).toEqual(['m3']);
    expect(bySender.items.map((item) => item.message.id)).toEqual(['m2']);
    expect(byPeriod.items.map((item) => item.message.id).sort()).toEqual(['m2', 'm3']);
  });

  it('mapping strict recusa campo desconhecido', async () => {
    await expect(
      raw.index({ index, id: 'x', document: { messageId: 'x', extra: true } })
    ).rejects.toMatchObject({
      meta: { statusCode: 400, body: { error: { type: 'strict_dynamic_mapping_exception' } } },
    });
  });

  it('apagar remove do índice (ausente não é erro)', async () => {
    await indexer.deleteMessage('m1');
    await indexer.deleteMessage('m1');
    await raw.indices.refresh({ index });

    expect((await run('coração')).items.map((item) => item.message.id).sort()).toEqual([
      'm2',
      'm3',
      'm5',
    ]);
  });

  it('reindex: o MongoDB manda — reindexa a que só saiu do índice e remove as apagadas', async () => {
    current = current.map((item) => (item.id === 'm5' ? { ...item, text: null } : item));

    await expect(indexer.reindexAll()).resolves.toEqual({
      scanned: 6,
      indexed: 5,
      deleted: 1,
      failed: 0,
    });
    await raw.indices.refresh({ index });

    expect((await run('coração')).items.map((item) => item.message.id).sort()).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect((await raw.count({ index })).count).toBe(5);
  });

  it('--recreate apaga e recria o índice', async () => {
    await expect(indexer.reindexAll({ recreate: true })).resolves.toMatchObject({
      scanned: 6,
      indexed: 5,
      deleted: 0,
    });
    await raw.indices.refresh({ index });

    expect((await raw.count({ index })).count).toBe(5);
  });
});
```

- [ ] **Step 2: Sem a variável, a suíte é pulada**

Run: `node node_modules/.bin/jest tests/integration --coverage=false`

Expected: `Test Suites: 1 skipped, 0 of 1 total` e `Tests: 13 skipped, 13 total`.

- [ ] **Step 3: Rodar contra um Elasticsearch 8.17 descartável**

Confira que a porta 19200 está livre (`ss -ltn | grep ':19200 '` sem saída) e suba um container próprio (nome exclusivo; nunca mexa nos `rtm-*` nem em containers de outros projetos):

```bash
docker run -d --name search-it-es -p 127.0.0.1:19200:9200 \
  -e discovery.type=single-node -e xpack.security.enabled=false \
  -e ES_JAVA_OPTS="-Xms512m -Xmx512m" \
  docker.elastic.co/elasticsearch/elasticsearch:8.17.0
```

Aguarde (ferramenta de espera, não `sleep` em primeiro plano) até `curl -s localhost:19200/_cluster/health` responder com `"status":"green"` (ou `yellow`). Então:

Run: `ELASTICSEARCH_IT_URL=http://localhost:19200 node node_modules/.bin/jest tests/integration --coverage=false`

Expected: PASS — `Tests: 13 passed, 13 total`. Se algum teste de analyzer falhar, a cadeia de filtros da Task 2 não está igual à do plano (decisão 2). Depois:

```bash
docker rm -f search-it-es
```

- [ ] **Step 4: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/integration/search/elasticsearch.int.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%; o resumo do jest mostra `1 skipped` (esta suíte).

- [ ] **Step 5: Commit**

```bash
git add tests/integration/search/elasticsearch.int.test.ts
git commit -m "✅ test: integração opcional com Elasticsearch real (analyzer, highlight e consultas)"
```


---

### Task 10: Comando `npm run search:reindex` (com `--recreate`)

**Files:**
- Modify: `jest.config.ts`
- Modify: `package.json`
- Create: `src/modules/search/cli/index.ts`
- Create: `src/modules/search/cli/reindex.command.ts`
- Modify: `src/modules/search/index.ts`
- Create: `src/scripts/reindexMessages.ts`
- Create: `tests/unit/modules/search/cli/reindex.command.test.ts`
- Modify: `tests/unit/modules/search/index.test.ts`

**Interfaces:**
- Consumes: `ISearchIndexService.reindexAll`, `searchIndexService` (Task 4); `connectMongo`/`disconnectMongo` (`src/shared/database/mongo`), `connectElasticsearch`/`disconnectElasticsearch` (`src/shared/database/elasticsearch`); `logger`.
- Produces: `runReindex({ argv, indexer, connect, disconnect, log }: ReindexCommandDeps): Promise<number>` (`@/modules/search/cli`, reexportado pelo barrel) — código de saída 0 sem falhas, 1 com item falho, erro no reindex ou falha ao desconectar; sempre desconecta.
- Produces: script `"search:reindex": "node --import tsx src/scripts/reindexMessages.ts"`; entrada `src/scripts/reindexMessages.ts` excluída da cobertura em `jest.config.ts` (decisão 5).

Uso: `npm run search:reindex` (sincroniza o índice com o MongoDB: indexa as ativas, remove as apagadas — também indexa as mensagens anteriores à busca) e `npm run search:reindex -- --recreate` (apaga e recria o índice antes; para mudanças de mapping/analyzer). O resumo sai no log (`scanned`, `indexed`, `deleted`, `failed`, `recreate`).

- [ ] **Step 1: Escrever os testes (falham hoje)**

Criar `tests/unit/modules/search/cli/reindex.command.test.ts`:

```ts
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
```

Em `tests/unit/modules/search/index.test.ts`, substituir:

```ts
    expect(searchModule.createSearchRateLimiter).toBeInstanceOf(Function);
  });
});
```

por:

```ts
    expect(searchModule.createSearchRateLimiter).toBeInstanceOf(Function);
  });

  it('deve exportar o comando de reindex', () => {
    expect(searchModule.runReindex).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/search/cli tests/unit/modules/search/index.test.ts --coverage=false`

Expected: FAIL — `Could not locate module @/modules/search/cli` e, no barrel, "deve exportar o comando de reindex" com `Expected constructor: Function`.

- [ ] **Step 3: Implementar**

Criar `src/modules/search/cli/reindex.command.ts`:

```ts
import type { ILogger } from '@/shared/interfaces';
import type { ISearchIndexService } from '../interfaces';

export interface ReindexCommandDeps {
  /** Argumentos da linha de comando (sem `node` e o script). */
  argv: string[];
  indexer: Pick<ISearchIndexService, 'reindexAll'>;
  /** Conecta MongoDB e Elasticsearch. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  log: Pick<ILogger, 'info' | 'error'>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * `npm run search:reindex [-- --recreate]`: sincroniza o índice de busca com o MongoDB.
 * Devolve o código de saída — 0 sem falhas; 1 se algum item falhou, se o reindex quebrou ou se a
 * desconexão falhou (tudo logado). Sempre desconecta.
 */
export async function runReindex({
  argv,
  indexer,
  connect,
  disconnect,
  log,
}: ReindexCommandDeps): Promise<number> {
  const recreate = argv.includes('--recreate');
  let code: number;

  try {
    await connect();
    const result = await indexer.reindexAll({ recreate });
    log.info('Reindexação da busca concluída', { ...result, recreate });
    code = result.failed > 0 ? 1 : 0;
  } catch (error) {
    log.error('Falha na reindexação da busca', toError(error), { recreate });
    code = 1;
  }

  try {
    await disconnect();
  } catch (error) {
    log.error('Falha ao desconectar do MongoDB/Elasticsearch', toError(error));
    code = 1;
  }

  return code;
}
```

Criar `src/modules/search/cli/index.ts`:

```ts
export { runReindex, type ReindexCommandDeps } from './reindex.command';
```

Em `src/modules/search/index.ts`, substituir:

```ts

export { createSearchRateLimiter, createSearchRoutes, searchRoutes } from './routes';
```

por:

```ts

export { createSearchRateLimiter, createSearchRoutes, searchRoutes } from './routes';

export { runReindex, type ReindexCommandDeps } from './cli';
```

Criar `src/scripts/reindexMessages.ts`:

```ts
// Entrada do `npm run search:reindex [-- --recreate]` (fora da cobertura: só liga as peças; a
// lógica está em `runReindex` e `SearchIndexService.reindexAll`, ambos testados).
import { runReindex } from '../modules/search/cli';
import { searchIndexService } from '../modules/search/services/SearchIndexService';
import { connectElasticsearch, disconnectElasticsearch } from '../shared/database/elasticsearch';
import { connectMongo, disconnectMongo } from '../shared/database/mongo';
import { logger } from '../shared/logger';

void runReindex({
  argv: process.argv.slice(2),
  indexer: searchIndexService,
  connect: async () => {
    await connectMongo();
    await connectElasticsearch();
  },
  disconnect: async () => {
    await disconnectElasticsearch();
    await disconnectMongo();
  },
  log: logger,
}).then((code) => {
  process.exit(code);
});
```

Em `jest.config.ts`, substituir:

```ts
    // ferramental de geração de dados de teste, não código de produção
    '!src/database/factories/**',
    // apenas tipos (interfaces/type aliases); o único import do arquivo existe só para o
    // compilador resolver as chaves computadas dos enums na interface EventMap e nunca
```

por:

```ts
    // ferramental de geração de dados de teste, não código de produção
    '!src/database/factories/**',
    // entrada do `npm run search:reindex`: só liga conexões e o runReindex (testado à parte)
    '!src/scripts/reindexMessages.ts',
    // apenas tipos (interfaces/type aliases); o único import do arquivo existe só para o
    // compilador resolver as chaves computadas dos enums na interface EventMap e nunca
```

Em `package.json`, substituir:

```json
    "db:migrate": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate",
    "db:migrate:undo": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate:undo",
    "db:seed": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:seed:all"
  },
  "repository": {
```

por:

```json
    "db:migrate": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate",
    "db:migrate:undo": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate:undo",
    "db:seed": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:seed:all",
    "search:reindex": "node --import tsx src/scripts/reindexMessages.ts"
  },
  "repository": {
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/search --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write jest.config.ts src/modules/search/cli/index.ts src/modules/search/cli/reindex.command.ts src/modules/search/index.ts src/scripts/reindexMessages.ts tests/unit/modules/search/cli/reindex.command.test.ts tests/unit/modules/search/index.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100% (a entrada `src/scripts/reindexMessages.ts` não aparece na cobertura; `npm run build` a compila — conferido na Task 12).

- [ ] **Step 6: Commit**

```bash
git add jest.config.ts \
  package.json \
  src/modules/search/cli/index.ts \
  src/modules/search/cli/reindex.command.ts \
  src/modules/search/index.ts \
  src/scripts/reindexMessages.ts \
  tests/unit/modules/search/cli/reindex.command.test.ts \
  tests/unit/modules/search/index.test.ts
git commit -m "✨ feat: comando npm run search:reindex (com --recreate)"
```


---

### Task 11: Cliente demo — busca de mensagens no cabeçalho

**Files:**
- Modify: `public/demo/app.js`
- Modify: `public/demo/index.html`
- Modify: `public/demo/styles.css`
- Modify: `tests/unit/app.test.ts`

**Interfaces:**
- Consumes: `GET /api/search/messages` (Task 7) — `{ items: [{ message, highlights, score }], total, tookMs }`; funções existentes de `public/demo/app.js` (`api`, `el`, `conversationTitle`, `openConversation`, `state.conversations`).

Spec §6 e decisão 14: formulário `#message-search-form` no cabeçalho (aparece depois do login), resultados em `#message-search` no topo da barra lateral (conversa, autor já conhecido, data, fragmento), clique abre a conversa. O fragmento de highlight é o ÚNICO `innerHTML` da demo; o teste do `app.test.ts` garante isso.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/app.test.ts`, substituir:

```ts
    });

    it('retorna 404 em formato JSON (notFoundHandler + errorHandler) para rota desconhecida', async () => {
      const response = await request(app).get('/rota-que-nao-existe');
```

por:

```ts
    });

    it('o cliente demo tem a busca de mensagens, com innerHTML só no highlight escapado', async () => {
      const page = await request(app).get('/demo/');
      const script = await request(app).get('/demo/app.js');

      expect(page.text).toContain('id="message-search-form"');
      expect(page.text).toContain('id="message-search-results"');
      expect(script.text).toContain('/search/messages?q=');
      expect(script.text.match(/\.innerHTML\s*=/g)).toHaveLength(1);
    });

    it('retorna 404 em formato JSON (notFoundHandler + errorHandler) para rota desconhecida', async () => {
      const response = await request(app).get('/rota-que-nao-existe');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/app.test.ts --coverage=false`

Expected: FAIL — "o cliente demo tem a busca de mensagens, com innerHTML só no highlight escapado" com `Expected substring: "id=\"message-search-form\""`.

- [ ] **Step 3: Implementar**

Em `public/demo/index.html` (2 trechos, na ordem):

1. Substituir:

```html
        </select>
      </label>
      <button id="logout" type="button" hidden>Sair</button>
    </header>
```

por:

```html
        </select>
      </label>
      <form id="message-search-form" role="search" hidden>
        <input
          name="q"
          type="search"
          placeholder="Buscar mensagens"
          aria-label="Buscar mensagens"
          maxlength="200"
          required
        />
        <button type="submit">Buscar</button>
      </form>
      <button id="logout" type="button" hidden>Sair</button>
    </header>
```

2. Substituir:

```html
    <main id="chat-view" hidden>
      <aside>
        <form id="search-form">
          <input name="query" placeholder="Buscar usuário para conversa 1:1" minlength="2" required />
```

por:

```html
    <main id="chat-view" hidden>
      <aside>
        <section id="message-search" hidden>
          <h2>
            Resultados da busca
            <button id="message-search-close" type="button" class="link">fechar</button>
          </h2>
          <p id="message-search-summary" class="search-meta"></p>
          <ol id="message-search-results"></ol>
        </section>
        <form id="search-form">
          <input name="query" placeholder="Buscar usuário para conversa 1:1" minlength="2" required />
```

Em `public/demo/styles.css` (2 trechos, na ordem):

1. Substituir:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1d2330; }
header { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; background: #1d2330; color: #fff; }
```

por:

```css
* { box-sizing: border-box; }
/* Regras com display (ex.: #login-view, #search-form) venceriam o [hidden] do navegador. */
[hidden] { display: none !important; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1d2330; }
header { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; background: #1d2330; color: #fff; }
```

2. Substituir:

```css
.dot.busy { background: #b3261e; }
.presence-line { margin: 0 0 0.5rem; font-size: 0.8rem; color: #6b7280; min-height: 1em; }
```

por:

```css
.dot.busy { background: #b3261e; }
.presence-line { margin: 0 0 0.5rem; font-size: 0.8rem; color: #6b7280; min-height: 1em; }
#message-search-form { display: flex; gap: 0.4rem; }
#message-search-form input { width: 14rem; padding: 0.3rem 0.5rem; }
#message-search { margin-bottom: 1rem; }
#message-search h2 { display: flex; justify-content: space-between; align-items: center; margin-top: 0; }
#message-search-results { list-style: none; margin: 0; padding: 0; }
#message-search-results li { border-bottom: 1px solid #dde1e8; }
.search-meta { font-size: 0.7rem; color: #6b7280; margin: 0 0 0.25rem; }
.fragment { font-size: 0.85rem; }
.fragment mark { background: #fde68a; padding: 0 0.1rem; }
button.link { background: none; color: #2f5bea; padding: 0; font-size: 0.8rem; }
```

Em `public/demo/app.js` (2 trechos, na ordem):

1. Substituir:

```js
    $('logout').hidden = false;
    $('status-label').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
```

por:

```js
    $('logout').hidden = false;
    $('status-label').hidden = false;
    $('message-search-form').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
```

2. Substituir:

```js
  });

  // ---------- mensagens ----------
```

por:

```js
  });

  // ---------- busca de mensagens ----------

  // Nome de quem enviou: só os já conhecidos pelas conversas carregadas (sem ir ao servidor).
  function knownUserName(userId) {
    if (userId === state.user.id) {
      return 'você';
    }
    for (const conversation of state.conversations) {
      const participant = conversation.participants.find((p) => p.id === userId);
      if (participant) {
        return participant.displayName ?? participant.username;
      }
    }
    return 'alguém';
  }

  function renderSearchResults({ items, total, tookMs }) {
    $('message-search').hidden = false;
    $('message-search-summary').textContent = `${total} resultado(s) · ${tookMs} ms`;
    $('message-search-results').replaceChildren(
      ...items.map(({ message, highlights }) => {
        const item = el('li');
        const conversation = state.conversations.find((c) => c.id === message.conversationId);
        const time = new Date(message.createdAt).toLocaleString([], {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const where = conversation ? conversationTitle(conversation) : 'Conversa';
        item.append(el('p', 'search-meta', `${where} · ${knownUserName(message.senderId)} · ${time}`));
        const fragment = el('p', 'fragment');
        if (highlights.length > 0) {
          // ÚNICO innerHTML da demo: o fragmento vem do Elasticsearch com encoder html (o texto do
          // usuário chega escapado) e só as tags <mark> são HTML de verdade.
          fragment.innerHTML = highlights.join(' … ');
        } else {
          fragment.textContent = message.content?.text ?? '';
        }
        item.append(fragment);
        item.addEventListener('click', () => void openConversation(message.conversationId));
        return item;
      })
    );
  }

  $('message-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = String(new FormData(event.target).get('q') ?? '').trim();
    if (!q) {
      return;
    }
    try {
      renderSearchResults(await api('GET', `/search/messages?q=${encodeURIComponent(q)}&limit=50`));
    } catch (error) {
      $('message-search').hidden = false;
      $('message-search-summary').textContent = `Falha na busca: ${error.message}`;
      $('message-search-results').replaceChildren();
    }
  });

  $('message-search-close').addEventListener('click', () => {
    $('message-search').hidden = true;
  });

  // ---------- mensagens ----------
```

- [ ] **Step 4: Rodar os testes da task e checar a sintaxe do JS**

Run: `node --check public/demo/app.js && node node_modules/.bin/jest tests/unit/app.test.ts --coverage=false`

Expected: nenhuma saída do `node --check` e PASS (34 testes).

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/unit/app.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add public/demo/app.js \
  public/demo/index.html \
  public/demo/styles.css \
  tests/unit/app.test.ts
git commit -m "✨ feat: busca de mensagens no cliente demo"
```


---
### Task 12: Verificação completa, prova "sem Elasticsearch/Redis reais", smoke na stack real, READMEs, SRS local e PR

**Files:**
- Modify: `README.md`, `README.pt-BR.md`, `.env.example`
- Modify (local, NÃO commitar): `.github/SRS.md`
- Create (fora do repo, no seu diretório de scratchpad): `connection-guard.cjs`, `smoke-search.cjs`, `pr-body.md`

Defina antes: `export SCRATCH=<seu diretório de scratchpad da sessão>` (arquivos temporários nunca vão para o repo). Todos os comandos rodam da raiz do repositório.

- [ ] **Step 1: Suíte completa + lint + format + tipos + build + open handles**

```bash
node node_modules/.bin/jest --silent --coverageReporters=text-summary
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/tsc --noEmit
npm run build && ls dist/src/scripts/reindexMessages.js dist/src/modules/search/index.js && rm -rf dist
node node_modules/.bin/jest tests/feature/modules/search tests/unit/modules/search tests/feature/modules/chat --coverage=false --detectOpenHandles
```

Expected: `Test Suites: 1 skipped, 202 passed, 202 of 203 total` e `Tests: 13 skipped, 2947 passed, 2960 total` (anote os números exatos impressos para os READMEs; a suíte pulada é a integração opcional da Task 9); resumo 100% statements/branches/functions/lines; eslint código 0 e sem warnings; Prettier "All matched files use Prettier code style!"; `tsc` e `build` sem erros (o `ls` encontra os dois arquivos compilados); a rodada com `--detectOpenHandles` termina sozinha (`Test Suites: 12 passed`), sem listar handles.

- [ ] **Step 2: Conferir 100% nos arquivos novos/alterados**

```bash
node node_modules/.bin/jest --coverage --coverageReporters=text \
  --collectCoverageFrom='src/modules/search/**/*.ts' \
  --collectCoverageFrom='src/modules/chat/**/*.ts' \
  --collectCoverageFrom='src/shared/types/error.types.ts' \
  --collectCoverageFrom='src/app.ts' \
  --coverageThreshold='{}'
```

Expected: 100% em todas as colunas de todos os arquivos listados (`src/scripts/reindexMessages.ts` não aparece: está fora do `collectCoverageFrom` e do padrão acima). Faltou algo → acrescentar teste no arquivo de teste da task que criou o código e commitar como `✅ test: …`.

- [ ] **Step 3: Provar que nenhum teste toca um Elasticsearch ou um Redis de verdade**

Confira que as portas 16998 e 16999 estão livres (`ss -ltn | grep -E ':1699[89] '` sem saída) e que `ELASTICSEARCH_IT_URL` NÃO está definida (`echo "${ELASTICSEARCH_IT_URL:-vazia}"` → `vazia`). Criar `$SCRATCH/connection-guard.cjs`:

```js
// Conta conexões TCP nas portas para onde o Redis (16998) e o Elasticsearch (16999) da config
// apontam durante a suíte: qualquer teste que use um deles "de verdade" cai aqui.
const net = require('net');
let count = 0;
for (const [name, port] of [['redis', 16998], ['elasticsearch', 16999]]) {
  net
    .createServer((socket) => {
      count += 1;
      console.log(`CONNECTION ${name} ${count}`);
      socket.destroy();
    })
    .listen(port, '127.0.0.1', () => console.log(`guard ${name} listening on ${port}`));
}
```

```bash
node "$SCRATCH/connection-guard.cjs" > "$SCRATCH/guard.log" 2>&1 &
echo $! > "$SCRATCH/guard.pid"
REDIS_HOST=127.0.0.1 REDIS_PORT=16998 ELASTICSEARCH_URL=http://127.0.0.1:16999 \
  node node_modules/.bin/jest --silent --coverage=false
kill "$(cat "$SCRATCH/guard.pid")"
cat "$SCRATCH/guard.log"
```

Expected: a suíte inteira passa (a integração opcional aparece como pulada) e o log tem só as duas linhas `guard redis listening on 16998` / `guard elasticsearch listening on 16999` — nenhuma linha `CONNECTION` (nenhum teste abriu conexão com o Redis ou o Elasticsearch da config). Se aparecer `CONNECTION`, rode os arquivos de teste isoladamente para achar o culpado e injete o `FakeSearchClient`/`FakeRedis` ou mocke `@/shared/database/elasticsearch`/`@/shared/database/redis` nele.

- [ ] **Step 4: Subir os bancos em portas alternativas e rodar as migrations**

```bash
set -a && source .env && set +a
export POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301
docker compose up -d postgres redis mongodb elasticsearch
docker compose ps
DB_HOST=localhost DB_PORT=15532 npm run db:migrate
```

Expected: `rtm-postgres`, `rtm-redis`, `rtm-mongodb`, `rtm-elasticsearch` "Up" nas portas 15532/16390/27117/9201 e as migrations aplicadas ("No migrations were executed" se já estavam — este subprojeto não cria migrations). Não subir `real-time-app` e não tocar em nenhum outro container. O `.env` só é lido (`source`), nunca escrito. Aguarde (ferramenta de espera) até `curl -s -u "elastic:$ELASTIC_PASSWORD" http://localhost:9201/_cluster/health` responder com `"status":"green"` ou `"yellow"` (o Elasticsearch deste compose tem segurança ligada e responde em HTTP com usuário `elastic`).

- [ ] **Step 5: Índice com o mapping novo e mensagens antigas indexadas (reindex com `--recreate`)**

As mensagens enviadas antes deste subprojeto (smokes anteriores) ainda não estão no índice, e um índice `messages` antigo teria outro mapping. O reindex com `--recreate` resolve os dois:

```bash
MONGO_USER_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_USER))")
MONGO_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_PASSWORD))")
export APP_ENV="DB_HOST=localhost DB_PORT=15532 REDIS_HOST=localhost REDIS_PORT=16390 ELASTICSEARCH_URL=http://localhost:9201"
export MONGODB_URL="mongodb://${MONGO_USER_ENC}:${MONGO_PASSWORD_ENC}@localhost:27117/${MONGO_DB}?authSource=admin"
env $APP_ENV npm run search:reindex -- --recreate; echo "exit=$?"
curl -s -u "elastic:$ELASTIC_PASSWORD" "http://localhost:9201/messages/_mapping" | grep -o '"dynamic":"strict"'
```

Expected: log `Índice de busca criado` (`index: messages`) e `Reindexação da busca concluída` com `failed: 0` e `recreate: true` (`scanned` = total de mensagens no MongoDB, apagadas inclusive; `indexed` + `deleted` ≤ `scanned`); `exit=0`; o `grep` imprime `"dynamic":"strict"`.

- [ ] **Step 6: Subir a app no host na porta 3100 (em background)**

Confirme antes que a porta 3100 está livre (`ss -ltn | grep ':3100 '` sem saída) — há outros projetos rodando na máquina; não encerre processos que não são seus.

```bash
env $APP_ENV PORT=3100 node --import tsx src/server.ts > "$SCRATCH/rtm-app.log" 2>&1 &
echo $! > "$SCRATCH/rtm-app.pid"
```

Aguarde a app responder (polling com a ferramenta de espera do seu ambiente, não `sleep` em primeiro plano) até `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/conversations` imprimir `401`. O índice já existe (Step 5), então o log da app NÃO mostra `Índice de busca criado` (o `ensureIndex` não mexe num índice existente). Se o processo morrer, ver `$SCRATCH/rtm-app.log`.

- [ ] **Step 7: Criar o script do smoke**

Criar `$SCRATCH/smoke-search.cjs`:

```js
// Smoke da busca contra a app no host. Uso (da raiz do repositório, com as mesmas variáveis de
// ambiente da app exportadas — o reindex roda com elas):
//   node smoke-search.cjs http://localhost:3100
// Registra três usuários, cria conversas, envia mensagens com e sem acento, busca pela API e
// roda o reindex. Imprime uma linha por verificação.
const { execFileSync } = require('child_process');

const base = process.argv[2] ?? 'http://localhost:3100';
const suffix = Date.now().toString(36);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tooks = [];

async function api(method, path, token, body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function register(name) {
  const { status, body } = await api('POST', '/auth/register', null, {
    username: `${name}${suffix}`,
    email: `${name}${suffix}@example.com`,
    password: 'Password123!',
    displayName: name,
  });
  if (status !== 201) {
    throw new Error(`register ${name}: HTTP ${status} ${JSON.stringify(body)}`);
  }
  return { id: body.data.user.id, token: body.data.tokens.accessToken };
}

async function search(user, params) {
  const query = new URLSearchParams(params).toString();
  const response = await api('GET', `/search/messages?${query}`, user.token);
  if (response.status === 200) {
    tooks.push(response.body.data.tookMs);
  }
  return response;
}

const texts = (response) =>
  response.body.data.items.map((item) => item.message.content.text).sort().join(' | ');

async function main() {
  const ana = await register('sana');
  const bob = await register('sbob');
  const carol = await register('scarol');

  const anaBob = (await api('POST', '/conversations/direct', ana.token, { userId: bob.id })).body
    .data.id;
  const anaCarol = (await api('POST', '/conversations/direct', ana.token, { userId: carol.id }))
    .body.data.id;
  const send = async (user, conversationId, text) =>
    (await api('POST', `/conversations/${conversationId}/messages`, user.token, { text })).body
      .data;

  const feliz = await send(ana, anaBob, 'Meu coração está feliz');
  await send(bob, anaBob, 'CORAÇÕES partidos <script>alert(1)</script>');
  const beforeThird = new Date().toISOString();
  await send(ana, anaBob, 'coracao sem acento, reunião amanhã');
  const afterThird = new Date().toISOString();
  await send(carol, anaCarol, 'o coração da Carol');
  await wait(1500); // refresh do índice (~1 s)

  await search(ana, { q: 'aquecimento' }); // primeira consulta aquece caches do Elasticsearch
  tooks.length = 0;

  for (const q of ['coração', 'coracao', 'CORAÇÕES', 'corações']) {
    const response = await search(ana, { q });
    console.log(`ana q=${q} status=${response.status} total=${response.body.data.total} -> ${texts(response)}`);
  }

  const scriptHit = (await search(ana, { q: 'partidos' })).body.data.items[0];
  console.log(`highlight=${scriptHit.highlights[0]}`);

  const facets = (await search(ana, { q: 'coração' })).body.data.facets.conversations;
  console.log(`facets=${facets.map((f) => `${f.conversationId === anaBob ? 'ana-bob' : 'ana-carol'}:${f.count}`).join(',')}`);

  const byConversation = await search(ana, { q: 'coração', conversationId: anaCarol });
  console.log(`filter conversation=ana-carol -> ${texts(byConversation)}`);
  const bySender = await search(ana, { q: 'coração', senderId: bob.id });
  console.log(`filter sender=bob -> ${texts(bySender)}`);
  const byPeriod = await search(ana, { q: 'coração', from: beforeThird, to: afterThird });
  console.log(`filter period=third -> ${texts(byPeriod)}`);
  const limited = await search(ana, { q: 'coração', limit: '1' });
  console.log(`limit=1 items=${limited.body.data.items.length} total=${limited.body.data.total}`);

  const carolSearch = await search(carol, { q: 'coração' });
  console.log(`carol q=coração -> ${texts(carolSearch)}`);
  const carolForeign = await search(carol, { q: 'coração', conversationId: anaBob });
  console.log(`carol conversation=ana-bob status=${carolForeign.status} code=${carolForeign.body.error.code}`);

  const invalid = await search(ana, { q: 'x', from: afterThird, to: beforeThird });
  console.log(`from>to status=${invalid.status}`);

  const removed = await api('DELETE', `/conversations/${anaBob}/messages/${feliz.id}`, ana.token);
  await wait(1500);
  const afterDelete = await search(bob, { q: 'feliz' });
  console.log(`delete status=${removed.status} bob q=feliz total=${afterDelete.body.data.total} items=${afterDelete.body.data.items.length}`);

  console.log(`tookMs<300=${tooks.every((took) => took < 300)} max=${Math.max(...tooks)}ms searches=${tooks.length}`);

  for (const args of [[], ['--', '--recreate']]) {
    const output = execFileSync('npm', ['run', 'search:reindex', ...args], { encoding: 'utf8' });
    const summary = /"failed": (\d+)/.exec(output);
    console.log(`reindex ${args.length === 0 ? 'normal' : '--recreate'} failed=${summary?.[1]}`);
    await wait(1500);
    const again = await search(ana, { q: 'coração' });
    console.log(`  ana q=coração -> ${texts(again)}`);
  }
}

main().catch((error) => {
  console.log(`FAIL ${error.message}`);
  process.exit(1);
});
```

- [ ] **Step 8: Rodar o smoke (da raiz do repositório)**

```bash
env $APP_ENV node "$SCRATCH/smoke-search.cjs" http://localhost:3100
```

Leva ~15 s (esperas de 1,5 s pelo refresh do índice e dois reindex). Expected (o `max` varia; tudo o mais é fixo):

```text
ana q=coração status=200 total=4 -> CORAÇÕES partidos <script>alert(1)</script> | Meu coração está feliz | coracao sem acento, reunião amanhã | o coração da Carol
ana q=coracao status=200 total=4 -> CORAÇÕES partidos <script>alert(1)</script> | Meu coração está feliz | coracao sem acento, reunião amanhã | o coração da Carol
ana q=CORAÇÕES status=200 total=4 -> CORAÇÕES partidos <script>alert(1)</script> | Meu coração está feliz | coracao sem acento, reunião amanhã | o coração da Carol
ana q=corações status=200 total=4 -> CORAÇÕES partidos <script>alert(1)</script> | Meu coração está feliz | coracao sem acento, reunião amanhã | o coração da Carol
highlight=CORAÇÕES <mark>partidos</mark> &lt;script&gt;alert(1)&lt;&#x2F;script&gt;
facets=ana-bob:3,ana-carol:1
filter conversation=ana-carol -> o coração da Carol
filter sender=bob -> CORAÇÕES partidos <script>alert(1)</script>
filter period=third -> coracao sem acento, reunião amanhã
limit=1 items=1 total=4
carol q=coração -> o coração da Carol
carol conversation=ana-bob status=404 code=NOT_FOUND
from>to status=400
delete status=204 bob q=feliz total=0 items=0
tookMs<300=true max=104ms searches=12
reindex normal failed=0
  ana q=coração -> CORAÇÕES partidos <script>alert(1)</script> | coracao sem acento, reunião amanhã | o coração da Carol
reindex --recreate failed=0
  ana q=coração -> CORAÇÕES partidos <script>alert(1)</script> | coracao sem acento, reunião amanhã | o coração da Carol
```

Leitura: as quatro grafias acham as mesmas quatro mensagens (acentos e plural nos dois sentidos); o highlight marca o termo e devolve o `<script>` escapado; as facetas contam por conversa; os filtros por conversa, autor e período e o `limit` se combinam; a Carol só vê a conversa dela e recebe 404 (sem oráculo) na conversa alheia; `from > to` → 400; a mensagem apagada sai da busca; todas as 12 buscas medidas ficaram abaixo de 300 ms (`tookMs` do servidor, depois de uma consulta de aquecimento); o reindex normal e o `--recreate` terminam sem falhas e não "ressuscitam" a apagada. Divergências e onde investigar (corrigir com TDD na task de origem, commitar e repetir):
- Alguma grafia com `total` menor que 4 → analyzer (Task 2, decisão 2) — confira com `curl -s -u "elastic:$ELASTIC_PASSWORD" -H 'Content-Type: application/json' http://localhost:9201/messages/_analyze -d '{"analyzer":"pt_folded","text":"corações coração"}'` (os dois tokens devem ser iguais) e se o índice foi recriado no Step 5.
- `highlight` sem `<mark>` ou com `<script>` cru → consulta do `SearchService` (Task 6).
- Carol vendo a conversa Ana–Bob, ou `status=200` no filtro alheio → autorização (Task 6).
- `delete ... total=1` → MessageIndexer (Task 5) — confira `Falha ao remover a mensagem da busca` no `$SCRATCH/rtm-app.log`; a mensagem que volta após o reindex → varredura das apagadas (Tasks 1 e 4).
- `tookMs<300=false` → rode de novo (a primeira consulta depois de subir o Elasticsearch é mais lenta; o script já faz um aquecimento) e, se persistir, veja o `max`.
- 429 no `register` → o limiter de auth (5 req/15 min por IP) já foi consumido: `docker exec rtm-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB` (só o Redis deste projeto) e rodar de novo.

- [ ] **Step 9: Integração opcional contra o Elasticsearch do compose (com autenticação)**

```bash
ELASTIC_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.ELASTIC_PASSWORD))")
ELASTICSEARCH_IT_URL="http://elastic:${ELASTIC_PASSWORD_ENC}@localhost:9201" \
  NODE_ENV=test node node_modules/.bin/jest tests/integration --coverage=false
```

Expected: `Tests: 13 passed, 13 total` (a suíte cria e apaga um índice `messages-it-<hex>` próprio; o índice `messages` não é tocado).

- [ ] **Step 10: Encerramento gracioso**

```bash
kill -TERM "$(cat "$SCRATCH/rtm-app.pid")"
```

Aguarde (ferramenta de espera, não `sleep`) até `kill -0 "$(cat "$SCRATCH/rtm-app.pid")" 2>/dev/null` falhar. Expected: `$SCRATCH/rtm-app.log` termina com `SIGTERM recebido: encerrando o servidor` e o processo sai sozinho em poucos segundos. Use o PID salvo — nunca `pkill`/`pgrep -f` com padrão genérico. Os containers `rtm-*` podem ficar de pé (ou `docker compose stop postgres redis mongodb elasticsearch`); nunca `down -v`.

- [ ] **Step 11 (opcional): Demo no navegador**

Com a app de pé (repita o Step 6 se já a encerrou), abrir `http://localhost:3100/demo/`, logar com um usuário do smoke (ex.: `sana<sufixo>@example.com` / `Password123!` — o sufixo aparece nos usernames criados; ou registre um novo), buscar "coracao" no campo do cabeçalho e conferir: resultados com a conversa, o autor, a data e o termo destacado em amarelo; o `<script>` aparece como texto; clicar abre a conversa. Encerrar depois pelo PID. Não é critério de aceite.

- [ ] **Step 12: Atualizar `README.md`**

Cada item é uma substituição literal (trecho atual → trecho novo); os totais de testes vêm do Step 1 (troque `2960`/`2,960`/`203` se os números impressos forem outros).

1. Hero (linha 5) — trocar:

````text
Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts, typing indicators and presence (online/away/busy, last seen), with Redis caching on the hot paths — today; search and notifications on the way, each on the store that fits it.
````

por:

````text
Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts, typing indicators and presence (online/away/busy, last seen), Redis caching on the hot paths and full-text message search on Elasticsearch — today; notifications on the way, each on the store that fits it.
````

2. Badge de testes — trocar:

````text
tests-2796%20Jest
````

por:

````text
tests-2960%20Jest
````

3. Aviso "Work in progress" — trocar:

````text
> **Work in progress.** Authentication, profiles, contacts/blocks, chat (1:1 and group conversations, messages in MongoDB) and presence are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators, online/away/busy with last seen, Redis caching with event-driven invalidation and a minimal demo client at `/demo`. Message search is the next milestone — see the [roadmap](#roadmap).
````

por:

````text
> **Work in progress.** Authentication, profiles, contacts/blocks, chat (1:1 and group conversations, messages in MongoDB), presence and message search are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators, online/away/busy with last seen, Redis caching with event-driven invalidation, accent-insensitive full-text search with highlighting on Elasticsearch and a minimal demo client at `/demo`. Notifications, email and file attachments are the next milestone — see the [roadmap](#roadmap).
````

4. Arquitetura (mermaid) — nó da busca — trocar:

````text
    API -.-> NOTIF[notifications]
    API -.-> SEARCH[search]
````

por:

````text
    API -.-> NOTIF[notifications]
    API --> SEARCH[search module]
````

5. Arquitetura (mermaid) — Elasticsearch, EventBus e classe `planned` — trocar:

````text
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF,SEARCH,ES planned
````

por:

````text
    SEARCH --> ES[(Elasticsearch<br/>messages index)]
    SEARCH --> CHAT
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES
    EB --> SEARCH

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF planned
````

6. Cliente demo — trocar:

````text
and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read, "typing…" and presence (a dot per 1:1 conversation, last seen in the header, and a status selector) live.
````

por:

````text
and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read, "typing…" and presence (a dot per 1:1 conversation, last seen in the header, and a status selector) live, plus a message search box in the header (results show the conversation, author, date and the highlighted fragment; clicking one opens the conversation).
````

7. Seção nova "Search" (inserida imediatamente antes de `### Rate limiting`) — trocar:

````text
### Rate limiting

````

por:

````text
### Search — `/api/search`

Full-text search over the messages of the conversations the caller belongs to **at search time**. The `search` module indexes messages in Elasticsearch (`MessageIndexer`: `{ async: true }` subscribers of `chat:message-sent` and `chat:message-deleted`, so indexing never delays a send); MongoDB stays the source of truth — hits are hydrated from it, so a message deleted in the meantime never shows up.

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` | `/api/search/messages` | ✓ | `q` (required, 1–200 characters) · `conversationId` · `senderId` · `from` / `to` (ISO 8601 with a timezone, `from ≤ to`) · `limit` (1–100, default 20) → `{ items: [{ message, highlights, score }], total, facets: { conversations: [{ conversationId, count }] }, tookMs }` |

- **Index** — `messages` (override with `ELASTICSEARCH_MESSAGES_INDEX`), created at startup when missing and never changed when it exists; `dynamic: strict` mapping with `messageId`, `conversationId`, `senderId` (keywords), `content` (text) and `createdAt` (date), `_id` = message id; deleted messages are removed from it. One shard and no replicas fit a single development node — set replicas for production.
- **Accents and plurals** — the `pt_folded` analyzer (lowercase → ASCII folding → Portuguese stopwords → `-oes` becomes `-ao` → light Portuguese stemmer) runs at index and query time, so "coração", "coracao", "CORAÇÕES" and "corações" all match each other; `content.exact` (no stemming) weighs twice, so the exact form ranks first. Known gap: irregular plurals such as "pães" don't match "pão".
- **Ranking and highlighting** — relevance first, then newest; up to 3 fragments of 150 characters per message wrapped in `<mark>…</mark>`, with the message text HTML-escaped by Elasticsearch (safe to insert as HTML); `facets.conversations` lists the 10 conversations with most hits; `total` is capped at 10,000 (Elasticsearch default).
- **Authorization** — only conversations the caller belongs to now (a `terms` filter, checked again during hydration); a `conversationId` the caller isn't part of answers 404, exactly like a conversation that doesn't exist.
- **Limits and errors** — 30 requests per minute per IP on this route; Elasticsearch down → 503 `SEARCH_UNAVAILABLE` (nothing else in the API depends on it); invalid parameters → 400.
- **Freshness and recovery** — a new message becomes searchable within about 1 s (the index refresh). Indexing failures are logged with the `messageId`; `npm run search:reindex` walks MongoDB in batches of 500 (by `_id`), indexes live messages and removes deleted ones (idempotent — also how messages sent before search existed get indexed), and `npm run search:reindex -- --recreate` drops and rebuilds the index first (after a mapping or analyzer change). It exits with 1 if any item failed.

Known limitations: search covers message content only — author and conversation names aren't indexed (names change; filter by `senderId`/`conversationId` instead); messages of a deleted conversation stay in the index until a `--recreate` reindex, although nobody can get them back (nobody belongs to that conversation anymore); there's no pagination beyond `limit` (a query returns at most 100 hits).

### Rate limiting

````

8. Rate limiting — linha da busca — trocar:

````text
| `/auth/login` | 15 min | 5 failed attempts | Successful logins aren't counted (`skipSuccessfulRequests`); fails closed on store errors |

````

por:

````text
| `/auth/login` | 15 min | 5 failed attempts | Successful logins aren't counted (`skipSuccessfulRequests`); fails closed on store errors |
| `/api/search/messages` | 1 min | 30 req | Own bucket per IP (prefix `rl:search:`), on top of the global limit |

````

9. Development — script do reindex — trocar:

````text
npm run db:seed             # sequelize-cli db:seed:all
```
````

por:

````text
npm run db:seed             # sequelize-cli db:seed:all
npm run search:reindex      # sync the Elasticsearch messages index with MongoDB (-- --recreate rebuilds it)
```
````

10. Tests — totais e fakes (os números vêm do Step 1) — trocar:

````text
**Tests** — 2,827 Jest tests in 189 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`; Redis is replaced by an in-memory fake, `tests/support/redis/fakeRedis.ts`, whose command semantics were checked against Redis 7).
````

por:

````text
**Tests** — 2,960 Jest tests in 203 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`; Redis and Elasticsearch are replaced by in-memory fakes, `tests/support/redis/fakeRedis.ts` and `tests/support/elasticsearch/fakeSearchClient.ts`, whose command and response shapes were checked against Redis 7 and Elasticsearch 8.17). The 13 tests of `tests/integration/search/elasticsearch.int.test.ts` run against a real Elasticsearch only when `ELASTICSEARCH_IT_URL` is set (e.g. `http://localhost:9200`) and are skipped otherwise, CI included — they prove the analyzer (accents, plurals, stemming), the escaped highlighting and the exact queries.
````

11. Estrutura — módulo search e scripts — trocar:

````text
│   └── presence/             PresenceService (Redis) · connection hooks,
│                             heartbeat and sweep · presence:update bridge ·
│                             REST controller · cache invalidation listeners
└── shared/
````

por:

````text
│   ├── presence/             PresenceService (Redis) · connection hooks,
│   │                         heartbeat and sweep · presence:update bridge ·
│   │                         REST controller · cache invalidation listeners
│   └── search/               SearchIndexService (index, reindex) ·
│                             SearchService (query, hydration) · MessageIndexer
│                             listeners · controller · routes · reindex command
├── scripts/                  reindexMessages.ts (npm run search:reindex)
└── shared/
````

12. Estrutura — tests — trocar:

````text
├── feature/                  supertest against the Express app
└── support/                  in-memory fakes (chat repositories, Redis, sockets)
````

por:

````text
├── feature/                  supertest against the Express app
├── integration/              optional suites against real services (ELASTICSEARCH_IT_URL)
└── support/                  in-memory fakes (chat repositories, Redis, Elasticsearch, sockets)
````

13. Configuração — índice — trocar:

````text
| `ELASTIC_PASSWORD` | Elasticsearch |

````

por:

````text
| `ELASTIC_PASSWORD` | Elasticsearch |
| `ELASTICSEARCH_MESSAGES_INDEX` | Name of the messages search index (default `messages`) |

````

14. Roadmap — trocar:

````text
- [ ] Search — message search on Elasticsearch
````

por:

````text
- [x] Search — full-text message search on Elasticsearch: accent- and plural-insensitive Portuguese analyzer, relevance, highlighting, filters by conversation, author and date, facets, participant-only results, automatic indexing and a reindex command
````

- [ ] **Step 13: Atualizar `README.pt-BR.md` (mesmas mudanças, em português)**

Cada item é uma substituição literal (trecho atual → trecho novo); os totais de testes vêm do Step 1.

1. Hero (linha 5) — trocar:

````text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura, indicador de digitação e presença (online/ausente/ocupado, visto por último), com cache Redis nos caminhos quentes — hoje; busca e notificações a caminho, cada um no banco que melhor o atende.
````

por:

````text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura, indicador de digitação e presença (online/ausente/ocupado, visto por último), cache Redis nos caminhos quentes e busca full-text de mensagens no Elasticsearch — hoje; notificações a caminho, cada uma no banco que melhor a atende.
````

2. Badge de testes — trocar:

````text
testes-2796%20Jest
````

por:

````text
testes-2960%20Jest
````

3. Aviso "Em desenvolvimento" — trocar:

````text
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios, chat (conversas 1:1 e em grupo, mensagens no MongoDB) e presença estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação, online/ausente/ocupado com visto por último, cache Redis com invalidação por evento e um cliente demo mínimo em `/demo`. A busca de mensagens é o próximo marco — veja o [roadmap](#roadmap).
````

por:

````text
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios, chat (conversas 1:1 e em grupo, mensagens no MongoDB), presença e busca de mensagens estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação, online/ausente/ocupado com visto por último, cache Redis com invalidação por evento, busca full-text sem distinção de acentos e com destaque no Elasticsearch e um cliente demo mínimo em `/demo`. Notificações, email e anexos são o próximo marco — veja o [roadmap](#roadmap).
````

4. Arquitetura (mermaid) — nó da busca — trocar:

````text
    API -.-> NOTIF[notificações]
    API -.-> SEARCH[busca]
````

por:

````text
    API -.-> NOTIF[notificações]
    API --> SEARCH[módulo search]
````

5. Arquitetura (mermaid) — Elasticsearch, EventBus e classe `planned` — trocar:

````text
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF,SEARCH,ES planned
````

por:

````text
    SEARCH --> ES[(Elasticsearch<br/>índice de mensagens)]
    SEARCH --> CHAT
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES
    EB --> SEARCH

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF planned
````

6. Cliente demo — trocar:

````text
e a presença (um indicador por conversa 1:1, visto por último no cabeçalho e um seletor de status).
````

por:

````text
e a presença (um indicador por conversa 1:1, visto por último no cabeçalho e um seletor de status), além de um campo de busca de mensagens no cabeçalho (os resultados mostram conversa, autor, data e o fragmento com os termos destacados; clicar abre a conversa).
````

7. Seção nova "Busca" (inserida imediatamente antes de `### Rate limit`) — trocar:

````text
### Rate limit

````

por:

````text
### Busca — `/api/search`

Busca full-text nas mensagens das conversas das quais o usuário participa **no momento da busca**. O módulo `search` indexa as mensagens no Elasticsearch (`MessageIndexer`: subscribers `{ async: true }` de `chat:message-sent` e `chat:message-deleted`, então a indexação nunca atrasa um envio); o MongoDB continua sendo a fonte da verdade — os acertos são hidratados a partir dele, então uma mensagem apagada nesse meio-tempo nunca aparece.

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/api/search/messages` | ✓ | `q` (obrigatório, 1–200 caracteres) · `conversationId` · `senderId` · `from` / `to` (ISO 8601 com fuso, `from ≤ to`) · `limit` (1–100, padrão 20) → `{ items: [{ message, highlights, score }], total, facets: { conversations: [{ conversationId, count }] }, tookMs }` |

- **Índice** — `messages` (sobrescrito por `ELASTICSEARCH_MESSAGES_INDEX`), criado na inicialização quando não existe e nunca alterado quando existe; mapping `dynamic: strict` com `messageId`, `conversationId`, `senderId` (keywords), `content` (texto) e `createdAt` (data), `_id` = id da mensagem; mensagens apagadas saem dele. Um shard e nenhuma réplica servem a um nó de desenvolvimento — defina as réplicas em produção.
- **Acentos e plurais** — o analyzer `pt_folded` (minúsculas → remoção de acentos → stopwords do português → `-oes` vira `-ao` → stemmer leve do português) roda na indexação e na consulta, então "coração", "coracao", "CORAÇÕES" e "corações" se encontram; `content.exact` (sem stemmer) pesa o dobro, e a forma exata aparece primeiro. Lacuna conhecida: plurais irregulares como "pães" não casam com "pão".
- **Relevância e destaque** — primeiro a relevância, depois as mais recentes; até 3 fragmentos de 150 caracteres por mensagem com `<mark>…</mark>`, com o texto da mensagem escapado para HTML pelo Elasticsearch (seguro para inserir como HTML); `facets.conversations` traz as 10 conversas com mais acertos; `total` é limitado a 10.000 (padrão do Elasticsearch).
- **Autorização** — só as conversas das quais o usuário participa agora (filtro `terms`, conferido de novo na hidratação); um `conversationId` do qual ele não participa responde 404, igual a uma conversa que não existe.
- **Limites e erros** — 30 requisições por minuto por IP nesta rota; Elasticsearch fora do ar → 503 `SEARCH_UNAVAILABLE` (nada mais na API depende dele); parâmetros inválidos → 400.
- **Atualização e recuperação** — uma mensagem nova aparece na busca em cerca de 1 s (o refresh do índice). Falhas de indexação são logadas com o `messageId`; `npm run search:reindex` percorre o MongoDB em lotes de 500 (por `_id`), indexa as mensagens ativas e remove as apagadas (idempotente — é também como as mensagens anteriores à busca entram no índice), e `npm run search:reindex -- --recreate` apaga e recria o índice antes (depois de mudar o mapping ou o analyzer). Sai com código 1 se algum item falhar.

Limitações conhecidas: a busca cobre só o conteúdo das mensagens — nomes de autor e de conversa não são indexados (nomes mudam; filtre por `senderId`/`conversationId`); mensagens de uma conversa apagada ficam no índice até um reindex com `--recreate`, mas ninguém consegue recuperá-las (ninguém participa mais daquela conversa); não há paginação além de `limit` (uma consulta devolve no máximo 100 acertos).

### Rate limit

````

8. Rate limit — linha da busca — trocar:

````text
| `/auth/login` | 15 min | 5 tentativas com falha | Logins bem-sucedidos não contam (`skipSuccessfulRequests`); falha fechado se o store der erro |

````

por:

````text
| `/auth/login` | 15 min | 5 tentativas com falha | Logins bem-sucedidos não contam (`skipSuccessfulRequests`); falha fechado se o store der erro |
| `/api/search/messages` | 1 min | 30 req | Bucket próprio por IP (prefixo `rl:search:`), além do limite global |

````

9. Desenvolvimento — script do reindex — trocar:

````text
npm run db:seed             # sequelize-cli db:seed:all
```
````

por:

````text
npm run db:seed             # sequelize-cli db:seed:all
npm run search:reindex      # sincroniza o índice de mensagens do Elasticsearch com o MongoDB (-- --recreate recria)
```
````

10. Testes — totais e fakes (os números vêm do Step 1) — trocar:

````text
**Testes** — 2.827 testes Jest em 189 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`; o Redis é substituído por um fake em memória, `tests/support/redis/fakeRedis.ts`, com a semântica dos comandos conferida contra o Redis 7).
````

por:

````text
**Testes** — 2.960 testes Jest em 203 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`; o Redis e o Elasticsearch são substituídos por fakes em memória, `tests/support/redis/fakeRedis.ts` e `tests/support/elasticsearch/fakeSearchClient.ts`, com a semântica dos comandos e o formato das respostas conferidos contra o Redis 7 e o Elasticsearch 8.17). Os 13 testes de `tests/integration/search/elasticsearch.int.test.ts` rodam contra um Elasticsearch de verdade só quando `ELASTICSEARCH_IT_URL` está definida (ex.: `http://localhost:9200`) e são pulados nos demais casos, inclusive no CI — eles comprovam o analyzer (acentos, plurais, stemmer), o destaque escapado e as consultas exatas.
````

11. Estrutura — módulo search e scripts — trocar:

````text
│   └── presence/             PresenceService (Redis) · hooks de conexão,
│                             heartbeat e varredura · ponte presence:update ·
│                             controller REST · listeners de invalidação
└── shared/
````

por:

````text
│   ├── presence/             PresenceService (Redis) · hooks de conexão,
│   │                         heartbeat e varredura · ponte presence:update ·
│   │                         controller REST · listeners de invalidação
│   └── search/               SearchIndexService (índice, reindex) ·
│                             SearchService (consulta, hidratação) · listeners
│                             do MessageIndexer · controller · rotas · comando de reindex
├── scripts/                  reindexMessages.ts (npm run search:reindex)
└── shared/
````

12. Estrutura — tests — trocar:

````text
├── feature/                  supertest contra o app Express
└── support/                  fakes em memória (repositórios do chat, Redis, sockets)
````

por:

````text
├── feature/                  supertest contra o app Express
├── integration/              suítes opcionais contra serviços reais (ELASTICSEARCH_IT_URL)
└── support/                  fakes em memória (repositórios do chat, Redis, Elasticsearch, sockets)
````

13. Configuração — índice — trocar:

````text
| `ELASTIC_PASSWORD` | Elasticsearch |

````

por:

````text
| `ELASTIC_PASSWORD` | Elasticsearch |
| `ELASTICSEARCH_MESSAGES_INDEX` | Nome do índice de busca das mensagens (padrão `messages`) |

````

14. Roadmap — trocar:

````text
- [ ] Busca — busca de mensagens no Elasticsearch
````

por:

````text
- [x] Busca — busca full-text de mensagens no Elasticsearch: analyzer de português sem distinção de acentos e plurais, relevância, destaque, filtros por conversa, autor e data, facetas, resultados só das conversas do usuário, indexação automática e comando de reindex
````

- [ ] **Step 14: Atualizar `.env.example`**

1. Depois de `ELASTIC_PASSWORD=` — trocar:

````text
ELASTIC_PASSWORD=

````

por:

````text
ELASTIC_PASSWORD=

# Índice das mensagens na busca (padrão: messages). Depois de mudar o mapping/analyzer, recrie
# com `npm run search:reindex -- --recreate`.
# ELASTICSEARCH_MESSAGES_INDEX=messages

````

- [ ] **Step 15: Atualizar o SRS local (`.github/SRS.md` — NÃO commitar; está em `.git/info/exclude`)**

1. Sprint 8 — título e tarefas — trocar:

````text
### 📅 Sprint 8 (Semana 8): Busca com Elasticsearch

**Objetivo:** Busca full-text eficiente em mensagens

**Tarefas:**
- [ ] Criar índice de mensagens no Elasticsearch
- [ ] Implementar MessageIndexer (indexação automática)
- [ ] Criar SearchService (query, filtros, agregações)
- [ ] Implementar SearchController
- [ ] Criar sistema de highlight de termos
- [ ] Implementar filtros (data, autor, conversa)
- [ ] Otimizar performance de busca
- [ ] Criar testes de busca
````

por:

````text
### 📅 Sprint 8 (Semana 8): Busca com Elasticsearch ✅

**Objetivo:** Busca full-text eficiente em mensagens

**Tarefas:**
- [x] Criar índice de mensagens no Elasticsearch (`messages`, mapping strict, analyzer `pt_folded`, criado no bootstrap)
- [x] Implementar MessageIndexer (indexação automática — subscribers assíncronos de `chat:message-sent`/`chat:message-deleted` + `npm run search:reindex`)
- [x] Criar SearchService (query `multi_match` em `content` + `content.exact^2`, filtros, agregação por conversa, hidratação no MongoDB)
- [x] Implementar SearchController (`GET /api/search/messages`, rate limit de 30 req/min)
- [x] Criar sistema de highlight de termos (`<mark>`, fragmentos de 150 caracteres, `encoder: html`)
- [x] Implementar filtros (data, autor, conversa)
- [x] Otimizar performance de busca (`_source: false`, filtros em contexto de filtro, 1 shard; `tookMs` medido no smoke < 300 ms)
- [x] Criar testes de busca (unitários com fake do Elasticsearch, feature ponta a ponta, integração opcional com Elasticsearch real; 100% de cobertura)
````

2. §7.4 — mapping real (atenção: no SRS atual a linha `"content": { ` termina com um espaço) — trocar:

````text
### 7.4 Elasticsearch (Mapping)

```json
{
  "messages": {
    "mappings": {
      "properties": {
        "conversation_id": { "type": "keyword" },
        "sender_id": { "type": "keyword" },
        "content": { 
          "type": "text",
          "analyzer": "standard"
        },
        "created_at": { "type": "date" }
      }
    }
  }
}
```
````

por:

````text
### 7.4 Elasticsearch (Mapping)

Índice `messages` (nome configurável por `ELASTICSEARCH_MESSAGES_INDEX`), `_id` = id da mensagem no MongoDB; mensagens apagadas não ficam no índice. Definição em `src/modules/search/constants/search.constants.ts`:

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "filter": {
        "pt_stop": { "type": "stop", "stopwords": "_portuguese_" },
        "pt_plural_oes": { "type": "pattern_replace", "pattern": "oes$", "replacement": "ao" },
        "pt_stemmer": { "type": "stemmer", "language": "light_portuguese" }
      },
      "analyzer": {
        "pt_folded": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "pt_stop", "pt_plural_oes", "pt_stemmer"]
        },
        "pt_exact": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "messageId": { "type": "keyword" },
      "conversationId": { "type": "keyword" },
      "senderId": { "type": "keyword" },
      "content": {
        "type": "text",
        "analyzer": "pt_folded",
        "fields": { "exact": { "type": "text", "analyzer": "pt_exact" } }
      },
      "createdAt": { "type": "date" }
    }
  }
}
```
````

Conferir que o arquivo não aparece como staged: `git status --short .github` não deve listar `SRS.md`.

- [ ] **Step 16: Commitar a documentação**

```bash
git add README.md README.pt-BR.md .env.example
git commit -m "📝 docs: documenta a busca de mensagens (índice, analyzer, endpoint, reindex e limitações)"
git status --short
```

Expected: árvore limpa (exceto arquivos locais ignorados).

- [ ] **Step 17: Push e PR**

Criar `$SCRATCH/pr-body.md`:

```markdown
## Resumo
- Módulo `search`: índice `messages` no Elasticsearch (mapping `strict`, analyzer `pt_folded` — minúsculas, sem acentos, stopwords, plural `-ões` e stemmer leve do português — e subcampo `content.exact`), criado de forma idempotente no bootstrap
- MessageIndexer: subscribers assíncronos de `chat:message-sent`/`chat:message-deleted` (a indexação não atrasa o envio); falhas logadas com o `messageId`; `npm run search:reindex [-- --recreate]` sincroniza o índice com o MongoDB em lotes de 500 (indexa as ativas, remove as apagadas)
- `GET /api/search/messages`: relevância (forma exata pesa o dobro), highlight com `<mark>` e HTML escapado, filtros por conversa, autor e período, facetas por conversa, até 100 resultados, `tookMs`; só conversas das quais o usuário participa no momento da busca (conversa alheia → 404), hidratação no MongoDB (apagadas nunca aparecem), rate limit de 30 req/min, Elasticsearch fora → 503 `SEARCH_UNAVAILABLE`
- Chat: `IMessageService.findByIdsForSearch` e `forEachForIndexing`
- `@elastic/elasticsearch` 9 → 8.19: o cliente 9 é recusado pelo Elasticsearch 8.17 do docker-compose (teste amarra os majors)
- Cliente demo: campo de busca no cabeçalho com resultados destacados

## Requisitos
RF006.1 (indexação, relevância, destaque, filtros por data, conversa e autor — "título" não existe em mensagens e "autor" é o filtro `senderId`) e RF006.2 (< 300 ms, até 100 resultados); busca com e sem acentos

## Testes
- Unitários do módulo search e das novas consultas do chat, 100% de cobertura; `FakeSearchClient` com as formas de resposta e de erro do Elasticsearch 8.17
- Feature ponta a ponta (supertest + chat em memória): indexação assíncrona, isolamento por participação, exclusão, filtros, validação e 503
- Integração opcional com Elasticsearch real (`ELASTICSEARCH_IT_URL`): analyzer (coração/coracao/CORAÇÕES/corações), highlight escapado, mapping strict e reindex — pulada no CI; a suíte normal não abre conexão com Elasticsearch nem Redis (provado com um contador de conexões)
- Smoke na stack real (portas alternativas, app em :3100): acentos nos dois sentidos, highlight, facetas, filtros, usuário não participante, exclusão, `tookMs` < 300 ms e reindex (normal e `--recreate`)
```

```bash
git push -u origin feature/search
gh pr create --base main --head feature/search \
  --title "✨ Sprint 8: busca de mensagens no Elasticsearch" \
  --body-file "$SCRATCH/pr-body.md"
```

Se `gh pr create` falhar (ex.: GraphQL/permissão), usar a API REST:

```bash
gh api repos/GabeSilvaDev/realtime-messaging-platform/pulls \
  -f title="✨ Sprint 8: busca de mensagens no Elasticsearch" \
  -f head=feature/search -f base=main \
  -F body=@"$SCRATCH/pr-body.md" --jq .html_url
```

Expected: URL do PR impressa. Acompanhar o CI (`gh pr checks --watch`); o merge fica a cargo do controlador depois do CI verde e da revisão.

---
## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** §1 objetivo e interpretação de RF006.1 (conteúdo + filtro `senderId`; nomes fora) → Tasks 6, 7 e READMEs (Task 12); §2 índice (`ELASTICSEARCH_MESSAGES_INDEX`, `ensureIndex` idempotente no bootstrap, 1 shard/0 réplicas documentado, analyzer com `asciifolding` antes do stemmer + `content.exact`, mapping `strict` com os cinco campos, apagadas fora do índice) → Tasks 2, 4 e 5 (decisão 2 corrige a cadeia do analyzer, medida contra o 8.17); §3 indexação (subscribers assíncronos, `index` com `_id = messageId` e `refresh: false`, `delete` com 404 ignorado, falhas logadas com `messageId`, `npm run search:reindex` com lotes de 500 por cursor de `_id` e `--recreate`, entrada fora da cobertura, corrida delete-antes-do-index, `findByIdsForSearch`/`forEachForIndexing`) → Tasks 1, 4, 5 e 10 (decisões 4 e 5 para `listConversationIdsFor` e para as apagadas no reindex); §4 API (parâmetros e limites, 404 sem oráculo, `from ≤ to`, lista vazia sem Elasticsearch, `bool` com `must` + filtros, `size`, ordenação, highlight 150/3/`<mark>`/`encoder: html`, agregação top 10, hidratação com ordem e descartes, envelope, `total` ≤ 10 000, sem paginação, 503 `SEARCH_UNAVAILABLE`, rate limit 30/min por IP) → Tasks 2, 6 e 7 (decisões 6–10); §5 estrutura do módulo, `SearchClient` injetável, fake e integração opcional → Tasks 2–10 (decisão 3); §6 demo → Task 11 (decisão 14); §7 testes (unitários, feature, integração opcional, smoke, 100%) → Tasks 1–11 e 12; §8 documentação (READMEs, `.env.example`, SRS Sprint 8 e §7.4) → Task 12; §9 DoD (acentos, < 300 ms medido, CI com 100%, PR) → Task 12.
- **Placeholders:** nenhum "TBD"/"implementar depois"; todo código de `src`, `tests`, `public` e dos scripts está completo. Os únicos valores preenchidos na execução são medidos (totais de testes, `max` do `tookMs`, `$SCRATCH`, contagens do reindex no Step 5 da Task 12).
- **Consistência de tipos/nomes:** `IndexableMessage`, `findActiveByIds`/`findPageAfter`, `findByIdsForSearch`/`forEachForIndexing`, `ErrorCode.SEARCH_UNAVAILABLE`, `DEFAULT_MESSAGES_INDEX`/`resolveMessagesIndex`/`SEARCH_CONSTANTS`/`MESSAGES_INDEX_SETTINGS`/`MESSAGES_INDEX_MAPPINGS`, `MessageDocument`/`MessageSearchAggregations`/`SearchClient`/`SearchMessagesParams`/`MessageSearchHit`/`ConversationFacet`/`MessageSearchResult`/`ReindexOptions`/`ReindexResult`, `SearchUnavailableException`/`InvalidSearchRangeException`, `searchMessagesQuerySchema`, `FakeSearchClient`/`FakeResponseError`, `ISearchIndexService`/`SearchIndexService`/`searchIndexService`/`SearchIndexServiceOptions`, `registerSearchIndexListeners`, `ISearchService`/`SearchService`/`searchService`/`SearchServiceOptions`, `SearchController`/`searchController`, `createSearchRateLimiter`/`createSearchRoutes`/`searchRoutes`, `runReindex`/`ReindexCommandDeps` são usados nas tasks posteriores exatamente como definidos nas anteriores.
- **Validação:** todo o código foi escrito e validado numa cópia do repositório (worktree descartável, sem `.env`, com as variáveis do CI e um `node_modules` próprio): cada task, na ordem do plano, passou `tsc --noEmit`, `eslint src` (sem warnings), `prettier --check` e a suíte com 100% de cobertura; o "Rodar e ver falhar" de cada task foi conferido aplicando só os testes sobre o commit anterior (as falhas listadas são as observadas; na Task 2, a cópia já tinha o cliente 8 instalado, então só a dependência declarada falhou lá — no repositório as duas falham). Os trechos "substituir … por …" e os arquivos "Criar" foram gerados a partir dos commits validados, e um script conferiu que cada trecho é único no arquivo no momento de aplicar e que a sequência reproduz cada arquivo byte a byte; as substituições dos READMEs, do `.env.example` e do SRS foram aplicadas às cópias atuais desses arquivos (cada trecho casou exatamente uma vez). Contra um Elasticsearch 8.17 descartável: a incompatibilidade do cliente 9 (400 `media_type_header_exception`), as cadeias de analyzer (decisão 2, 17 grupos de palavras), o highlight com `encoder: html` escapando `<script>`, o mapping `strict`, as formas de `bulk`/`delete`/erros usadas pelo fake e pelos services, e as consultas exatas do `SearchService` (via a Task 9, 13/13, sem e com segurança/autenticação na URL). Contra um MongoDB 8 descartável (senha com `@`, `:` e `/`): `findActiveByIds`, `findPageAfter` e a varredura em lotes; e o `npm run search:reindex` (normal e `--recreate`, `exit 0`). A suíte inteira rodou com o Redis e o Elasticsearch apontados para um contador de conexões (0 conexões); `npm run build` compila (inclusive `dist/src/scripts/reindexMessages.js`); `--detectOpenHandles` limpo; o feature test passou 3 vezes seguidas e falha sem o MessageIndexer. O smoke das Steps 5–10 da Task 12 foi executado contra uma stack descartável equivalente (PostgreSQL 17, Redis 7 com senha, MongoDB 8, Elasticsearch 8.17 com segurança ligada) com a app no host em :3100, com a saída listada no Step 8 (`max=104ms`) e o SIGTERM gracioso. Não executados na escrita do plano: a demo num navegador (só `node --check`, o teste do `app.test.ts` e a revisão do código), o `docker compose` do próprio projeto (usado só na execução) e o push/PR.
