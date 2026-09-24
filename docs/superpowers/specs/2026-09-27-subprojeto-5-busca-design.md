# Subprojeto 5 — Busca de Mensagens (Sprint 8) — Design

**Data:** 2026-09-27
**Roadmap:** [2026-09-23-roadmap-finalizacao-design.md](2026-09-23-roadmap-finalizacao-design.md) §3.5
**Depende de:** subprojeto 2 (módulo `chat`, MongoDB fonte única das mensagens)
**Status:** Aprovado (execução autônoma autorizada pelo usuário)

---

## 1. Objetivo

Busca full-text de mensagens (RF006): indexação automática no Elasticsearch, relevância, destaque dos termos, filtros por conversa, autor e data, até 100 resultados por consulta, resposta < 300 ms, busca com e sem acentos. Resultados sempre restritos às conversas das quais o usuário participa **no momento da busca**.

Interpretação de RF006.1 "buscar em título, conteúdo, autor": mensagens não têm título; a busca textual é no conteúdo, e "autor" é o filtro `senderId`. Buscar pelo nome do autor/da conversa fica fora (nomes mudam e exigiriam reindexação) — documentado.

## 2. Índice

Nome configurável por `ELASTICSEARCH_MESSAGES_INDEX` (padrão `messages`). Criado de forma idempotente no `bootstrap()` (`ensureIndex`: cria se não existe; se existe, não mexe). O Elasticsearch já é dependência dura do bootstrap (`connectElasticsearch`).

Settings: 1 shard, 0 réplicas no dev (configurável não é necessário — documentar para produção). Analyzer customizado `pt_folded`:

```json
{
  "analysis": {
    "filter": {
      "pt_stop": { "type": "stop", "stopwords": "_portuguese_" },
      "pt_stemmer": { "type": "stemmer", "language": "light_portuguese" }
    },
    "analyzer": {
      "pt_folded": {
        "type": "custom",
        "tokenizer": "standard",
        "filter": ["lowercase", "asciifolding", "pt_stop", "pt_stemmer"]
      }
    }
  }
}
```

`asciifolding` antes do stemmer e aplicado na indexação e na consulta: "coração", "coracao" e "CORAÇÕES" se encontram. Subcampo `content.exact` (`standard` + `lowercase` + `asciifolding`, sem stemmer) para dar mais peso à forma exata (`multi_match` `most_fields`, `content.exact^2`).

Mapping (`dynamic: strict`):

| Campo | Tipo |
|---|---|
| `messageId` | `keyword` (também o `_id` do documento) |
| `conversationId` | `keyword` |
| `senderId` | `keyword` |
| `content` | `text` (`pt_folded`) + `content.exact` |
| `createdAt` | `date` |

Mensagens apagadas (tombstone) não ficam no índice.

## 3. Indexação

`MessageIndexer` (módulo `search`, `listeners`): subscribers **assíncronos** do EventBus (não atrasam o envio):
- `chat:message-sent` → `index` do documento (`_id = messageId`, `refresh: false`; a busca vê a mensagem em até ~1 s, o refresh padrão do índice).
- `chat:message-deleted` → `delete` (404 ignorado).

Falhas são logadas (`error`, com `messageId`) e não relançadas. Recuperação: script `npm run search:reindex` (`src/scripts/reindexMessages.ts`, fora da cobertura só no arquivo de entrada; a lógica fica em `SearchIndexService.reindexAll` testada) que percorre o MongoDB em lotes de 500 (cursor por `_id`, só não apagadas) e faz `bulk index` idempotente; `--recreate` apaga e recria o índice antes (para mudanças de mapping). Também serve para indexar mensagens anteriores ao subprojeto.

Corrida delete-antes-do-index (dois subscribers assíncronos): a busca hidrata os resultados no MongoDB (§4) e descarta apagadas, então um documento "ressuscitado" nunca aparece; o próximo reindex o remove. Documentado.

Acesso aos dados do chat só por interface (roadmap §2.3): `IMessageService` ganha `findByIdsForSearch(ids)` (DTOs das não apagadas, sem checagem de participante — quem chama já filtrou por conversas permitidas) e `forEachForIndexing(batchSize, handler)` (varredura em lotes). `IConversationService` ganha `listConversationIdsFor(userId)` (ids das conversas das quais o usuário participa hoje).

## 4. API

`GET /api/search/messages` (autenticado, rate limit próprio de 30 req/min por IP (chave padrão do projeto) via `createRateLimiter`):

| Parâmetro | Regra |
|---|---|
| `q` | obrigatório, 1–200 caracteres após trim |
| `conversationId` | UUID opcional; se o usuário não participa → 404 `CONVERSATION_NOT_FOUND` (mesma resposta de "não existe", sem oráculo) |
| `senderId` | UUID opcional |
| `from`, `to` | ISO 8601 opcionais; `from ≤ to` senão 400 |
| `limit` | 1–100, padrão 20 |

Fluxo: ids das conversas permitidas (`listConversationIdsFor`; vazio → resposta vazia sem consultar o ES) → consulta `bool` com `must: multi_match(q)` e `filter: terms conversationId (permitidas ∩ filtro) + term senderId + range createdAt` → `size = limit`, ordenação por `_score` e depois `createdAt desc` → highlight em `content` (fragmentos de 150 caracteres, até 3, tags `<mark>`/`</mark>`, `encoder: html` — o texto do usuário volta escapado; o cliente pode inserir o fragmento como HTML) → agregação `terms` por `conversationId` (top 10, para facetas) → hidratação no MongoDB por ids (`findByIdsForSearch`), mantendo a ordem do ES e descartando os que não voltaram (apagados) ou cuja conversa não está no conjunto permitido (defesa em profundidade).

Resposta (envelope do projeto):

```json
{ "success": true, "data": {
  "items": [{ "message": MessageDTO, "highlights": ["...<mark>coração</mark>..."], "score": 3.2 }],
  "total": 42,
  "facets": { "conversations": [{ "conversationId": "…", "count": 12 }] },
  "tookMs": 7
} }
```

`total` = total de acertos do ES (limitado a 10 000 pelo `track_total_hits` padrão, documentado). Sem paginação além de `limit` (RF006.2: no máximo 100 por consulta).

Elasticsearch fora do ar → 503 `SEARCH_UNAVAILABLE` (a busca depende do ES; o resto da API não é afetado).

## 5. Módulo `search`

`src/modules/search/{constants,controllers,errors,interfaces,listeners,routes,services,types,validation,index.ts}`:
- `constants`: nome do índice, settings/mapping, limites (`MAX_LIMIT = 100`, `DEFAULT_LIMIT = 20`, `MAX_QUERY_LENGTH = 200`, `REINDEX_BATCH = 500`).
- `services/SearchIndexService.ts`: `ensureIndex()`, `indexMessage(doc)`, `deleteMessage(id)`, `reindexAll({ recreate })`, sobre um cliente mínimo injetável (`SearchClient` = `Pick` do `Client` do `@elastic/elasticsearch` com `indices.exists/create/delete`, `index`, `delete`, `bulk`, `search`).
- `services/SearchService.ts`: `searchMessages(userId, params)`.
- `listeners/search.listeners.ts`: `registerSearchIndexListeners()` (devolve unregister), registrado no `bootstrap()` após `ensureIndex()`.
- `controllers/SearchController.ts`, `routes/search.routes.ts` montado em `/api/search`.
- `errors`: `SearchUnavailableException` (503), `InvalidSearchRangeException` (400).

Testes sem Elasticsearch real: `tests/support/elasticsearch/fakeSearchClient.ts` registra chamadas e devolve respostas configuradas; a semântica do analyzer (acentos, stemmer) é comprovada no smoke real e num teste de integração **opcional** (`tests/integration/search/elasticsearch.int.test.ts`, só roda com `ELASTICSEARCH_IT_URL` definido; fora do CI e fora da cobertura), usado na escrita do plano e na Task de verificação.

## 6. Cliente demo

Campo de busca no cabeçalho: resultados numa lista (conversa, autor por id→nome já conhecido, data, fragmento com `<mark>` inserido via `innerHTML` **apenas** para o highlight já escapado pelo ES — todo o resto por `textContent`); clicar abre a conversa. CSP intacta.

## 7. Testes

- Unitários: `SearchIndexService` (ensureIndex idempotente, index/delete/404, reindex em lotes com cursor e `--recreate`, erros de bulk item a item logados), `SearchService` (autorização, interseção de filtros, conversa não permitida → 404, lista vazia sem consultar ES, hidratação/ordem/descartes, highlight, facetas, ES fora → 503), listeners, validação, controller, rotas, novos métodos de chat.
- Feature (supertest, fake client): `GET /api/search/messages` ponta a ponta com o módulo chat em memória.
- Integração opcional com ES real (acentos e stemmer: "coração"/"coracao"/"corações").
- Smoke real: enviar mensagens com e sem acento, buscar nas duas formas, highlight, filtros, usuário não participante não vê, apagar remove da busca, `tookMs` < 300, reindex.
- Cobertura 100% do código novo; global 100% mantida.

## 8. Documentação

READMEs EN/pt-BR (seção Busca: índice, analyzer, endpoint, limites, reindex, limitações), `.env.example` (`ELASTICSEARCH_MESSAGES_INDEX`), SRS local Sprint 8 (e §7.4 com o mapping real).

## 9. Definition of Done

RF006 atendido (incluindo com/sem acentos); < 300 ms medido no smoke; CI verde com 100%; PR mergeado.
