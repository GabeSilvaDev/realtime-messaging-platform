# Subprojeto 0 — Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o projeto com ambiente reproduzível, scripts de banco funcionando, cobertura global ≥ 90% com threshold ativo e README honesto.

**Architecture:** Nenhuma mudança de comportamento. Adiciona testes que faltam (código já existente), parametriza portas do docker-compose, cria scripts `db:*` com `tsx` e ativa `coverageThreshold`. Remove um branch morto e marca dois trechos defensivos com `istanbul ignore`.

**Tech Stack:** Node 20 (host) / 22 (container), TypeScript 5.9, Jest 30 + ts-jest, supertest, sequelize-cli, tsx, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` — seção 4.

## Global Constraints

- Branch: `chore/baseline` a partir de `main` (após merge do PR de docs `docs/roadmap`, ou a partir de `docs/roadmap` se ainda não mergeado).
- Commits: gitmoji + Conventional Commits em PT-BR. NUNCA mencionar Claude/Anthropic/IA nem `Co-Authored-By`.
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (um hook reescreve `npx jest` e filtra saída).
- `jest.config.ts` usa `resetMocks`/`restoreMocks`/`clearMocks`: implementações de `jest.fn(impl)` criadas em factories de `jest.mock` são apagadas antes de cada teste. Os testes fornecidos já tratam isso — não "simplificar" para `jest.fn(impl)` em factory.
- `tsc` inclui `tests/**`: todo teste deve passar em `node node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- Não parar nem alterar containers de outros projetos na máquina (portas 3000, 5432, 6379 do host estão ocupadas por eles).
- Baseline medida em 2026-09-23: 73 suítes / 1316 testes passando; cobertura global lines 75.48 / branches 62.03 / functions 72.31 / statements 76.42.

## Fontes dos testes

Os arquivos de teste deste plano já foram escritos e validados (passam, cobertura 100% no arquivo-alvo, `tsc` limpo) e estão em:

```
SCRATCH=/tmp/claude-1000/-home-gabriel-Documentos-real-time-messaging-platform/3bade429-f4f8-43c8-a31f-bf4248b4c968/scratchpad
$SCRATCH/tests/upload.test.ts                    -> tests/unit/shared/config/upload.test.ts
$SCRATCH/tests/ImageProcessorService.test.ts     -> tests/unit/shared/services/ImageProcessorService.test.ts
$SCRATCH/tests/StorageService.test.ts            -> tests/unit/shared/services/StorageService.test.ts
$SCRATCH/testsB/tests/...                        -> mesmo caminho relativo no repo
$SCRATCH/testsC/tests/...                        -> mesmo caminho relativo no repo
```

Cada task copia os arquivos, aplica as mudanças de `src/` indicadas e verifica. Se um arquivo de origem não existir, PARAR e reportar (não reescrever do zero).

## File Structure

| Arquivo | Ação | Motivo |
|---|---|---|
| `package.json` | Modificar | scripts `db:*`, `test:watch` |
| `docker-compose.yml` | Modificar | portas do host parametrizadas |
| `.env.example` | Modificar | documentar portas/hosts |
| `jest.config.ts` | Modificar | threshold 90% |
| `src/shared/services/ImageProcessorService.ts` | Modificar | `istanbul ignore` em ramo defensivo |
| `src/shared/services/StorageService.ts` | Modificar | `istanbul ignore` em 2 trechos defensivos |
| `src/modules/user/services/AvatarService.ts` | Modificar | remover branch morto |
| `tests/unit/**`, `tests/feature/**` | Criar/Modificar | cobertura |
| `README.md` | Modificar | refletir estado real |
| `.github/SRS.md` | Modificar | checklist Sprint 4 com o que já existe |

---

### Task 1: Ambiente reproduzível (scripts de banco e portas)

**Files:**
- Modify: `package.json` (bloco `scripts`)
- Modify: `docker-compose.yml` (mapeamentos `ports`)
- Modify: `.env.example`

- [ ] **Step 1: Criar branch**

```bash
git fetch origin
git checkout -b chore/baseline docs/roadmap
```

- [ ] **Step 2: Scripts**

Em `package.json`, no objeto `scripts`, adicionar (mantendo os existentes):

```json
    "test:watch": "jest --watch --coverage=false",
    "db:migrate": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate",
    "db:migrate:undo": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:migrate:undo",
    "db:seed": "node --import tsx node_modules/sequelize-cli/lib/sequelize db:seed:all"
```

Verificar o entrypoint real do CLI: `node -p "require('./node_modules/sequelize-cli/package.json').bin"`. Se o bin apontar para outro arquivo (ex.: `lib/sequelize`), usar esse caminho.

- [ ] **Step 3: Portas do host parametrizadas**

Em `docker-compose.yml`, trocar os mapeamentos:

```yaml
      - '3000:3000'      ->  - '${APP_HOST_PORT:-3000}:3000'
      - '5432:5432'      ->  - '${POSTGRES_HOST_PORT:-5432}:5432'
      - '6379:6379'      ->  - '${REDIS_HOST_PORT:-6379}:6379'
      - '27017:27017'    ->  - '${MONGO_HOST_PORT:-27017}:27017'
      - '9200:9200'      ->  - '${ELASTIC_HOST_PORT:-9200}:9200'
      - '9300:9300'      ->  - '${ELASTIC_TRANSPORT_HOST_PORT:-9300}:9300'
```

Em `.env.example`, adicionar ao final:

```dotenv

# Host ports (docker compose) — altere se já estiverem em uso na máquina
APP_HOST_PORT=3000
POSTGRES_HOST_PORT=5432
REDIS_HOST_PORT=6379
MONGO_HOST_PORT=27017
ELASTIC_HOST_PORT=9200
ELASTIC_TRANSPORT_HOST_PORT=9300

# Rodando a app no host (fora do container) — aponte para as portas acima
# DB_HOST=localhost
# DB_PORT=5432
# REDIS_HOST=localhost
# REDIS_PORT=6379
# MONGODB_URL=mongodb://user:pass@localhost:27017/rtm?authSource=admin
# ELASTICSEARCH_URL=http://localhost:9200
```

- [ ] **Step 4: Validar stack com portas livres**

```bash
export POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301 APP_HOST_PORT=3100
docker compose up -d postgres redis mongodb elasticsearch
docker compose ps
```

Expected: 4 serviços `running`/`healthy`. (O serviço `real-time-app` não é usado aqui: ele monta o `node_modules` do host, compilado para glibc, num container Alpine/musl — o `sharp` não carrega. A app roda no host.)

- [ ] **Step 5: Validar migrations e seed no host**

```bash
DB_HOST=localhost DB_PORT=$POSTGRES_HOST_PORT npm run db:migrate
DB_HOST=localhost DB_PORT=$POSTGRES_HOST_PORT npm run db:seed
```

Expected: migrations `create-refresh-tokens-table`, `create-users`, `create-contacts-table` aplicadas; seed `demo-users` executado. Se falhar por ordem de migration (refresh_tokens referencia users e tem timestamp anterior), registrar o erro exato e corrigir renomeando o arquivo da migration de refresh tokens para um timestamp posterior a `20260103144432` (ex.: `20260103150000-create-refresh-tokens-table.ts`) — é seguro porque nenhum ambiente persistente depende desse nome ainda. Rodar `npm run db:migrate:undo` + `db:migrate` para confirmar ida e volta.

- [ ] **Step 6: Validar app no host**

```bash
DB_HOST=localhost DB_PORT=$POSTGRES_HOST_PORT REDIS_HOST=localhost REDIS_PORT=$REDIS_HOST_PORT \
MONGODB_URL="mongodb://$(grep ^MONGO_USER .env|cut -d= -f2):$(grep ^MONGO_PASSWORD .env|cut -d= -f2)@localhost:$MONGO_HOST_PORT/$(grep ^MONGO_DB .env|cut -d= -f2)?authSource=admin" \
ELASTICSEARCH_URL=http://localhost:$ELASTIC_HOST_PORT PORT=3100 npm run dev &
sleep 15; curl -s http://localhost:3100/health; kill %1
```

Expected: JSON de health com status ok. Se `/health` não existir, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/auth/me` deve retornar `401`. Anotar no PR o comando que funcionou (vai para o README na Task 6).

- [ ] **Step 7: Commit**

```bash
git add package.json docker-compose.yml .env.example
git commit -m "🔧 chore: adiciona scripts de banco e parametriza portas do docker compose"
```

(Se renomeou a migration no Step 5, incluir no mesmo commit com mensagem `🔧 chore: ... e corrige ordem das migrations`.)

---

### Task 2: Testes de config de upload e services de imagem/storage

**Files:**
- Create: `tests/unit/shared/config/upload.test.ts`
- Create: `tests/unit/shared/services/ImageProcessorService.test.ts`
- Create: `tests/unit/shared/services/StorageService.test.ts`
- Modify: `src/shared/services/ImageProcessorService.ts` (~linha 223)
- Modify: `src/shared/services/StorageService.ts` (~linhas 266 e 281)

- [ ] **Step 1: Copiar testes**

```bash
mkdir -p tests/unit/shared/config tests/unit/shared/services
cp $SCRATCH/tests/upload.test.ts tests/unit/shared/config/upload.test.ts
cp $SCRATCH/tests/ImageProcessorService.test.ts tests/unit/shared/services/ImageProcessorService.test.ts
cp $SCRATCH/tests/StorageService.test.ts tests/unit/shared/services/StorageService.test.ts
```

- [ ] **Step 2: Rodar e medir**

Run: `node node_modules/.bin/jest tests/unit/shared/config/upload.test.ts tests/unit/shared/services --coverage --coverageReporters=text --collectCoverageFrom='src/shared/{config/upload,services/ImageProcessorService,services/StorageService}.ts' --coverageThreshold='{}'`
Expected: PASS (172 testes). `upload.ts` 100/100; `ImageProcessorService.ts` 100% linhas, 99.04% branches (linha ~223); `StorageService.ts` ~98% linhas (linhas ~266-271 e ~282).

- [ ] **Step 3: Marcar ramos defensivos**

`src/shared/services/ImageProcessorService.ts`, no `resizeMultiple`, trocar a linha:

```ts
          error instanceof Error ? error : new Error(String(error)),
```

por:

```ts
          // resize() sempre rejeita com AppError (subclasse de Error): o ramo não-Error é defensivo.
          error instanceof Error ? error : /* istanbul ignore next */ new Error(String(error)),
```

`src/shared/services/StorageService.ts`, em `LocalStorageService.list`, trocar `} catch (error) {` do bloco que envolve `listFilesRecursive` por:

```ts
    } catch (error) /* istanbul ignore next -- listFilesRecursive já engole todos os erros */ {
```

e, no início de `listFilesRecursive`, imediatamente antes de:

```ts
    if (maxKeys !== undefined && maxKeys > 0 && results.length >= maxKeys) {
```

inserir:

```ts
    /* istanbul ignore if -- guarda defensiva: o laço já interrompe antes de recursar */
```

(Localizar as linhas exatas com `grep -n "new Error(String(error))" src/shared/services/ImageProcessorService.ts` e `grep -n "listFilesRecursive\|results.length >= maxKeys" src/shared/services/StorageService.ts`.)

- [ ] **Step 4: Rodar de novo**

Mesmo comando do Step 2.
Expected: os três arquivos em 100/100/100/100.

- [ ] **Step 5: Typecheck + lint**

```bash
node node_modules/.bin/tsc --noEmit -p tsconfig.json
node node_modules/.bin/eslint src/shared/services
```

Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/shared/config/upload.test.ts tests/unit/shared/services src/shared/services/ImageProcessorService.ts src/shared/services/StorageService.ts
git commit -m "✅ test: cobre config de upload, ImageProcessorService e StorageService"
```

---

### Task 3: Testes do módulo de perfil/avatar

**Files:**
- Create: `tests/unit/modules/user/controllers/ProfileController.test.ts`
- Create: `tests/unit/modules/user/services/AvatarService.test.ts`
- Create: `tests/unit/modules/user/errors/avatar.errors.test.ts`
- Create: `tests/unit/modules/user/errors/profile.errors.test.ts`
- Create: `tests/unit/modules/user/routes/profile.routes.test.ts`
- Modify: `tests/unit/modules/user/services/ProfileService.test.ts` (substituído pela versão completa)
- Modify: `src/modules/user/services/AvatarService.ts` (~linhas 149-151 + imports)

- [ ] **Step 1: Copiar testes**

```bash
for f in controllers/ProfileController services/AvatarService errors/avatar.errors errors/profile.errors routes/profile.routes services/ProfileService; do
  mkdir -p "tests/unit/modules/user/$(dirname $f)"
  cp "$SCRATCH/testsB/tests/unit/modules/user/$f.test.ts" "tests/unit/modules/user/$f.test.ts"
done
```

- [ ] **Step 2: Rodar e medir**

Run: `node node_modules/.bin/jest tests/unit/modules/user --coverage --coverageReporters=text --collectCoverageFrom='src/modules/user/{controllers/ProfileController,services/AvatarService,services/ProfileService,routes/profile.routes,errors/avatar.errors,errors/profile.errors}.ts' --coverageThreshold='{}'`
Expected: PASS. Todos em 100% exceto `AvatarService.ts` (linhas ~149-151 não cobertas).

- [ ] **Step 3: Remover branch morto do AvatarService**

Em `src/modules/user/services/AvatarService.ts`, no `catch` de `upload`, logo após:

```ts
      if (error instanceof AppError) {
        throw error;
      }
```

remover o bloco inalcançável (`ImageProcessingError` e `InvalidImageError` herdam de `AppError` e já foram relançados acima):

```ts
      if (error instanceof ImageProcessingError || error instanceof InvalidImageError) {
        throw new AvatarProcessingFailedError();
      }
```

Depois remover `ImageProcessingError` e `InvalidImageError` do import de `@/shared/services/ImageProcessorService` se não forem mais usados no arquivo (`grep -n "ImageProcessingError\|InvalidImageError" src/modules/user/services/AvatarService.ts`) — senão `noUnusedLocals` quebra o `tsc`.

- [ ] **Step 4: Rodar de novo**

Mesmo comando do Step 2.
Expected: todos os 6 arquivos em 100/100/100/100.

- [ ] **Step 5: Typecheck + lint + testes do módulo user e auth**

```bash
node node_modules/.bin/tsc --noEmit -p tsconfig.json
node node_modules/.bin/eslint src/modules/user
node node_modules/.bin/jest tests/unit/modules tests/feature/modules --coverage=false
```

Expected: sem erros; todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/modules/user src/modules/user/services/AvatarService.ts
git commit -m "✅ test: cobre ProfileController, AvatarService, ProfileService e rotas de perfil"
```

---

### Task 4: Testes de middlewares compartilhados e logger

**Files:**
- Create: `tests/unit/shared/middlewares/{upload,cors,helmet,requestLogger,requestId,notFound,rateLimiter}.test.ts`
- Create: `tests/unit/shared/logger/lazyLogger.test.ts`
- Modify: `tests/feature/shared/middlewares/requestId.test.ts` (passa a usar o middleware real)
- Modify: `tests/feature/shared/middlewares/notFound.test.ts` (passa a usar o handler real)

- [ ] **Step 1: Copiar testes**

```bash
mkdir -p tests/unit/shared/middlewares tests/unit/shared/logger
for f in upload cors helmet requestLogger requestId notFound rateLimiter; do
  cp "$SCRATCH/testsC/tests/unit/shared/middlewares/$f.test.ts" "tests/unit/shared/middlewares/$f.test.ts"
done
cp "$SCRATCH/testsC/tests/unit/shared/logger/lazyLogger.test.ts" tests/unit/shared/logger/lazyLogger.test.ts
cp "$SCRATCH/testsC/tests/feature/shared/middlewares/requestId.test.ts" tests/feature/shared/middlewares/requestId.test.ts
cp "$SCRATCH/testsC/tests/feature/shared/middlewares/notFound.test.ts" tests/feature/shared/middlewares/notFound.test.ts
```

- [ ] **Step 2: Rodar e medir**

Run: `node node_modules/.bin/jest tests/unit/shared/middlewares tests/unit/shared/logger tests/feature/shared --coverage --coverageReporters=text --collectCoverageFrom='src/shared/middlewares/*.ts' --collectCoverageFrom='src/shared/logger/index.ts' --coverageThreshold='{}'`
Expected: PASS; `upload`, `cors`, `helmet`, `requestLogger`, `requestId`, `notFound`, `rateLimiter` e `logger/index.ts` em 100/100/100/100.

- [ ] **Step 3: Typecheck**

Run: `node node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/shared/middlewares tests/unit/shared/logger/lazyLogger.test.ts tests/feature/shared/middlewares
git commit -m "✅ test: cobre middlewares compartilhados e logger lazy; feature tests usam implementações reais"
```

---

### Task 5: Threshold de cobertura 90%

**Files:**
- Modify: `jest.config.ts` (bloco `coverageThreshold`)

- [ ] **Step 1: Medir cobertura global**

Run: `node node_modules/.bin/jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary`
Expected: todos os testes passam. Anotar os 4 percentuais.

- [ ] **Step 2: Fechar lacunas remanescentes, se houver**

Listar arquivos abaixo de 100%:

```bash
node -e 'const s=require("./coverage/coverage-summary.json");for(const[f,v]of Object.entries(s)){if(f==="total")continue;if(v.lines.pct<100||v.branches.pct<100||v.functions.pct<100)console.log(v.lines.pct,v.branches.pct,v.functions.pct,f.replace(process.cwd()+"/",""))}'
```

Para cada arquivo listado (ex.: `src/modules/user/validation/profile.schemas.ts`), adicionar casos no teste unitário existente desse arquivo (mesmo diretório espelhado em `tests/unit/`) exercitando a linha/branch indicada por `node node_modules/.bin/jest <teste> --coverage --collectCoverageFrom=<arquivo> --coverageReporters=text --coverageThreshold='{}'` (coluna "Uncovered Line #s"). Objetivo: todas as métricas globais ≥ 90%; idealmente ≥ 95%.

- [ ] **Step 3: Ativar threshold**

Em `jest.config.ts`:

```ts
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
```

- [ ] **Step 4: Verificar**

```bash
node node_modules/.bin/jest
node node_modules/.bin/tsc --noEmit -p tsconfig.json
npm run lint
npm run build
```

Expected: tudo verde; jest não reporta "coverage threshold ... not met".

- [ ] **Step 5: Commit**

```bash
git add jest.config.ts tests
git commit -m "🔧 chore: ativa threshold global de cobertura de 90%"
```

---

### Task 6: README, SRS e PR

**Files:**
- Modify: `README.md`
- Modify: `.github/SRS.md`

- [ ] **Step 1: README honesto** (nas duas línguas)

- Badge `Coverage-100%25` → valor real medido na Task 5 arredondado para baixo (ex.: `Coverage-95%25`).
- Seção "Key Features"/"Principais Funcionalidades": marcar como `(planejado)` / `(planned)` os itens ainda não implementados: Real-Time Messaging (Socket.IO), Push Notifications, Full-Text Search, Online Presence.
- Tabela "Coverage Report"/"Relatório de Cobertura": valores reais da Task 5.
- "Available Scripts"/"Scripts Disponíveis": incluir `test:watch`, `db:migrate`, `db:migrate:undo`, `db:seed` (agora existem).
- Quick Start: acrescentar nota de portas (`*_HOST_PORT` no `.env`) e o comando validado na Task 1 Step 6 para rodar a app no host.
- Remover "100% Test Coverage" das features; trocar por "Test coverage ≥ 90% enforced in CI" / "Cobertura de testes ≥ 90% garantida".

- [ ] **Step 2: SRS**

Em `.github/SRS.md`, Sprint 4, marcar `[x]` em: `Implementar ProfileService (atualização, avatar)`, `Implementar upload de avatar (multer)`, `Criar processamento de imagem (sharp)`. Deixar `[ ]` os demais (feitos no subprojeto 1).

- [ ] **Step 3: Verificação final**

```bash
node node_modules/.bin/jest && npm run lint && npm run build && git status --short
```

Expected: verde; working tree só com os arquivos desta task.

- [ ] **Step 4: Commit, push e PR**

```bash
git add README.md .github/SRS.md
git commit -m "📝 docs: alinha README e SRS ao estado real do projeto"
git push -u origin chore/baseline
gh pr create --base main --title "🔧 Baseline: ambiente, scripts de banco e cobertura ≥ 90%" --body "$(cat <<'EOF'
## Resumo
- Scripts `db:migrate`, `db:migrate:undo`, `db:seed` (sequelize-cli via tsx) e `test:watch`
- Portas do host parametrizadas no docker-compose (`*_HOST_PORT`)
- Testes para upload config, ImageProcessorService, StorageService, ProfileController, AvatarService, ProfileService, profile.routes, erros, middlewares compartilhados e logger
- Feature tests de requestId/notFound agora usam as implementações reais
- Remove branch morto no AvatarService; marca 3 trechos defensivos com istanbul ignore
- `coverageThreshold` global 90%
- README e SRS refletem o estado real

## Cobertura
Antes: lines 75.48 / branches 62.03 / functions 72.31 / statements 76.42
Depois: (preencher com os valores da Task 5)
EOF
)"
```

Expected: URL do PR.
