# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Sempre responda em **português do Brasil**, independentemente do idioma usado pelo usuário.

## Project Overview

**RPAtec** is a React/TypeScript frontend for querying Brazilian judicial processes via the TecJustica MCP server, with a Node.js backend as proxy and Supabase for caching. The system has two runtime processes: the Vite frontend (port 5173) and the Express backend (port 3001).

## Running the System

```bash
# Frontend (Vite)
npm run dev

# Backend (required for all API calls)
node backend-server.js

# Type checking (zero errors required before any commit)
npx tsc --noEmit

# Build
npm run build
```

**Windows bash runner**: `npm run dev` may fail in automated bash scripts. Use directly:
```bash
"C:\\Program Files\\nodejs\\node.exe" node_modules/vite/bin/vite.js --port 5173 --host
"C:\\Program Files\\nodejs\\node.exe" backend-server.js
```

Preview servers are configured in `.claude/launch.json` as `"dev"` and `"backend"`.

## Architecture

### Two API Clients — Critical Distinction

There are **two separate Axios clients** with different base URL conventions:

| Client | File | Base URL | Path format |
|--------|------|----------|-------------|
| `backendClient` | `mcp.service.ts` | `VITE_API_BASE_URL` (= `http://localhost:3001`) | includes `/api/` prefix: `/api/process/...` |
| `apiClient` | `api.ts` | `VITE_API_BASE_URL` (= `http://localhost:3001`) | includes `/api/` prefix: `/api/escritorio/...` |

Both clients use `VITE_API_BASE_URL=http://localhost:3001` (no `/api` suffix). All service calls must include `/api/` in their paths. If you add a new service using `apiClient`, prefix every path with `/api/`.

### Data Flow

```
Component → Hook (React Query) → Service → [Memory Cache] → Backend REST API → MCP Server → Supabase write
```

**Two cache layers:**
1. **Memory cache** (`src/services/cache.ts`) — in-process Map, lost on page refresh, checked first
2. **Supabase** — persistent, TTL tracked in `cache_metadata` table

Services MCP (`process.service.ts`, `document.service.ts`, `precedent.service.ts`) seguem o padrão: check memória → fetch MCP → setCache → updateCacheMetadata → saveToSupabase.

`escritorio.service.ts` does **not** use the cache layer — escritório data is mutable user data, not MCP cache.

### Backend (`backend-server.js`)

Single-file Express server with three rate limiters:
- `generalLimiter`: 120 req/min on all `/api/*`
- `mcpLimiter`: 20 req/min on MCP-heavy endpoints
- `pdfLimiter`: 10 req/min on PDF proxy

Key backend responsibilities:
- Proxies MCP tool calls via `@modelcontextprotocol/sdk` (SSE/Streamable HTTP transport)
- Serves all `/api/escritorio/*` CRUD routes backed by Supabase
- Proxies PDF downloads through `/api/documento-pdf/:cnj/:docId`
- Writes audit logs to Supabase `audit_logs` table (fire-and-forget)

MCP: novo `Client` por chamada em `callMCPTool()`, sem connection pooling por design.

### Clientes Feature

- `src/pages/Clientes.tsx` — lista e CRUD de clientes
- `src/services/cliente.service.ts` — REST via `apiClient` em `/api/clientes/*`
- `src/types/` — tipos de cliente
- Supabase table: `clientes` (migration: `004_clientes.sql`)

### Financeiro Feature (Asaas)

- `src/pages/Financeiro.tsx` — cobranças e gateway
- `src/services/financeiro.service.ts` — REST via `apiClient` em `/api/financeiro/*`
- `src/types/financeiro.ts` — interfaces
- Supabase table: financeiro (migration: `009_financeiro_asaas.sql`)
- Fluxo: cliente sincronizado no Asaas → cobranças criadas/sincronizadas via `/api/financeiro/cobrancas`

### IA Feature

- `src/pages/ChatIA.tsx` — interface de chat
- `src/services/ia.service.ts` — REST via `apiClient` em `/api/ia/chat` e `/api/ia/status`
- Tokens de IA (Anthropic/OpenAI/Gemini) armazenados via `settings.service.ts` (ver abaixo)

### Settings — Tokens de IA

`src/services/settings.service.ts` — persiste tokens de provedores de IA no Supabase via `apiClient` (`/api/settings`). Funções: `getTokens()`, `saveTokens(AppSettings)`, `getToken(key)`, `deleteToken(key)`. Tokens nunca ficam em `.env` do frontend — são gerenciados em runtime pelo usuário na página `/configuracoes`.

### Escritório Feature

Pages/components for law office process management:
- `src/pages/MeusProcessos.tsx` — list, filter, CRUD
- `src/components/process/CadastroProcessoModal.tsx` — create/edit modal
- `src/services/escritorio.service.ts` — all REST calls to `/api/escritorio/*`
- `src/types/escritorio.ts` — interfaces

Supabase tables: `escritorio_processos`, `escritorio_alertas` (migration: `supabase/migrations/002_escritorio.sql`).

Monitoring logic (backend): `POST /api/escritorio/monitorar/:cnj` fetches current movements via MCP, hashes the most recent one, compares with stored `ultimo_hash_movimento`, and creates alerts on change.

### React Query Setup

`QueryClient` is in `src/App.tsx` with `staleTime: 5min` as default. Individual hooks override:
- `useProcess`, `useProcessParties` — `staleTime: 24h`
- `useProcessMovements`, `useProcessDocuments` — `staleTime: 6h`
- `usePrecedents` — `staleTime: 7d`, only runs when `enabled=true`

## Supabase

**Project**: `https://jtvojfqjtwfwcvqocadk.supabase.co`

Tables: `processes`, `process_parties`, `process_lawyers`, `process_movements`, `process_documents`, `precedents_cache`, `cache_metadata`, `audit_logs`, `escritorio_processos`, `escritorio_alertas`, `diligencias`, `clientes`, `settings`, `financeiro` (Asaas).

When creating new tables, always run `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated, service_role` after the migration — Supabase does not grant DML to these roles automatically for tables created via migrations.

Migrations em `supabase/migrations/` (verificar com `ls` antes de criar nova). Próxima: `010_`. Atenção: há múltiplos `003_*.sql` — numeração irregular.

## Environment Variables

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3001       # NO /api suffix
VITE_SUPABASE_URL=https://jtvojfqjtwfwcvqocadk.supabase.co
VITE_SUPABASE_KEY=<anon key>
BACKEND_PORT=3001
PROXY_TARGET_URL=https://tecjusticamcp-lite-production.up.railway.app/mcp
TECJUSTICA_AUTH_TOKEN=<bearer token>          # backend exits if missing
```

## Routing

| Route | Page |
|-------|------|
| `/` | `Home.tsx` — CNJ search, navigates directly without pre-fetch |
| `/process/:cnj` | `ProcessDetail.tsx` — 4 tabs (overview, parties, movements, documents) |
| `/document/:documentId` | `DocumentViewer.tsx` — requires `location.state.cnj` |
| `/precedents` | `PrecedentsPage.tsx` |
| `/search-cpf` | `SearchCPF.tsx` |
| `/meus-processos` | `MeusProcessos.tsx` |
| `/diligencias` | `FilaDiligencias.tsx` — fila operacional, filtros, ações por linha |
| `/dashboard-operacional` | `DashboardOperacional.tsx` — 6 cards métricas + próximos 7 dias + top-5 urgentes |
| `/dashboard-tempos` | `DashboardTempos.tsx` — análise de tempos processuais |
| `/ia` | `ChatIA.tsx` — interface de chat com IA |
| `/clientes` | `Clientes.tsx` — cadastro e gestão de clientes |
| `/financeiro` | `Financeiro.tsx` — módulo financeiro (integração Asaas) |
| `/comunicacao` | `Comunicacao.tsx` — aprovação de mensagens para clientes |
| `/configuracoes` | `Configuracoes.tsx` — configurações da aplicação |
| `/login` | `Login.tsx` — formulário e-mail/senha, redireciona para `/` se já autenticado |

`DocumentViewer` requires `cnj` passed via React Router `state` (set in `ProcessDetail` when clicking "Ler"). Without it, the viewer shows an error state.

## Gotchas & Hard-Won Lessons

### URL Prefix
`VITE_API_BASE_URL` is `http://localhost:3001` (no `/api`). All service calls in both `api.ts`-based and `mcp.service.ts`-based clients must include `/api/` in their path strings. Missing `/api/` causes silent 404s.

### CORS
Backend CORS is configured with `methods: ['GET', 'POST', 'PUT', 'DELETE']`. If you add new HTTP methods on the backend, also add them here.

### Supabase Upserts
Always pass `{ onConflict: 'field' }` to `upsert()`. Without it, repeated saves create duplicates. Use the unique constraint column (e.g., `cnj`, `hash_unico`, `process_id,nome`).

### Cache Keys
`CACHE_TTL` keys in `src/services/cache.ts` are lowercase (e.g., `'process_overview'`, `'process_movements'`). Must match exactly what services pass to `getCacheKey()`.

### MCP Response Parsing
Each MCP tool has its own parser in the backend (`parseVisaoGeral`, `parseMovimentos`, `parseDocumentos`, `parsePrecedentes`, `parseBuscaProcessos`). MCP responses come as text content — always use `parseMCPResponse(result, toolName)` then the tool-specific parser.

### Navigation from Home
`Home.tsx` navigates directly to `/process/:cnj` without pre-fetching — `ProcessDetail` handles loading and the "not found" state. Do not add a pre-fetch back.

### Navigation Polling
`Navigation.tsx` polls `GET /api/escritorio/alertas` E `listarDiligencias()` a cada 60s via `setInterval`. O segundo alimenta o badge de urgentes no link Diligências. Ambos rodam no mesmo interval para evitar dois timers.

### Backend Startup
`backend-server.js` calls `process.exit(1)` if `TECJUSTICA_AUTH_TOKEN` is missing. Network errors in the browser console are expected when the backend is not running.

### Backend: Reiniciar para Novas Rotas
`backend-server.js` não tem hot-reload. Após adicionar novos endpoints, parar e reiniciar o servidor backend — novas rotas retornam 404 até reiniciar.

### Formato da Resposta de Partes do MCP
`getPartiesMCP(cnj)` (backend `/api/process/:cnj/partes`) retorna `{ POLO_ATIVO: [{nome, tipo, cpf_cnpj}], POLO_PASSIVO: [...], POLO_OUTROS: [...] }`, não um array flat. Achatar antes de usar.

### Padrão para Modais Altos
Para modais com muitos campos que podem transbordar a tela: adicionar `max-h-[90vh] flex flex-col` no container do modal e `overflow-y-auto flex-1` no `<form>` interno.

### Escritório Alertas — Marcar Todos como Lidos
`PUT /api/escritorio/alertas/lidos/cnj/:cnj` marca todos os alertas não lidos de um CNJ como lidos. Usar antes de navegar para o detalhe do processo a partir de MeusProcessos (atualização otimista no estado local + chamada API).

### Motor de Gargalos

`src/utils/analisarGargalo.ts` — 7 regras heurísticas. Helpers em `processRules.ts`. Mocks em `gargaloMocks.ts`.
**Convenção**: `movements[0]` = mais recente. `PrioridadeGargalo`: `'URGENTE' | 'ALTA' | 'NORMAL' | 'MONITORAR'`.

### Diligências

`src/services/diligencia.service.ts` — CRUD via REST `/api/diligencias` com fallback localStorage. Migração automática one-shot na primeira chamada bem-sucedida (flag `'rpatec_diligencias_migrated'`).
Páginas: `src/pages/FilaDiligencias.tsx`, `src/pages/DashboardOperacional.tsx`.
Modal: `src/components/process/RetornoModal.tsx`.

### Diligências — Tabela Supabase

Tabela `diligencias` (migration: `supabase/migrations/003_diligencias.sql`). Campos snake_case no banco; backend faz conversão via `diligenciaToCamel()` / `diligenciaToSnake()`. `id` é `text PRIMARY KEY` (UUID gerado no frontend via `crypto.randomUUID()`).

### Auth — Supabase Auth

`src/contexts/AuthContext.tsx` — `AuthProvider` + `useAuth()`. Rotas protegidas via `src/components/ProtectedRoute.tsx` (`<Outlet />`).
`/login` é a única rota pública. Criar primeiro usuário no Supabase Dashboard → Authentication → Users → "Invite user".
`supabase?.auth` (operador optional chain) — `supabase` pode ser `null` se env vars ausentes.

### CSV Export — BOM para Excel

Ao gerar CSV com acentos, prefixar com `'\uFEFF'` no Blob para Excel abrir sem corromper encoding.
Exemplo: `new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })`

### ProcessDetail — Abas Dinâmicas

`BASE_TABS` (constante fora do componente) define as 4 abas estáticas. A 5ª aba "Diligências" é adicionada via `useMemo` com badge de contagem.
`Tabs.tsx` aceita `label: React.ReactNode` (não apenas `string`) — necessário para badges nos labels.
`loading` (estado combinado) controla o estado de carregamento — não usar `isLoading` de hooks individuais.

### ProcessMovement.data — Tipo `string | Date`

`ProcessMovement.data` é `string | Date` — converter com `typeof d === 'string' ? d : d.toISOString()` antes de usar como string.

### Backend — Nunca Expor error.message ao Cliente

Nunca retornar `error.message` ao cliente — usar `console.error()` internamente e responder com mensagem genérica.

### Migrations — Numeração Irregular

Há múltiplos arquivos `003_*.sql` (lawyers_unique, rls_restrict_writes, diligencias). A próxima migration deve usar `010_` — não confiar na numeração para inferir ordem, verificar sempre `ls supabase/migrations/` antes de criar nova.

### Hooks e Scripts Bash — Sem `jq`

`jq` não está instalado neste ambiente Windows. Para parsear JSON em hooks ou scripts bash, usar `python -c "import sys,json; d=json.load(sys.stdin); ..."`.

## Fluxo Git — Nunca Enviar para Main sem Aprovação

Todo código novo ou alterado deve passar por uma branch de teste antes de ir para o `main`:

1. **Trabalhar sempre em branch** — nunca commitar direto no `main`
2. **Branch de teste**: usar o padrão `feat/`, `fix/` ou `chore/` conforme o tipo
3. **Nunca fazer push para `main`** sem o usuário dizer explicitamente "pode enviar para o main"
4. Quando o trabalho estiver pronto, **avisar o usuário** com o resumo do que foi feito e aguardar aprovação
5. Só após aprovação explícita: fazer merge ou PR para `main`

Se o usuário pedir uma mudança e não especificar branch, criar uma branch nova com nome descritivo e informar qual foi criada.

## Perfil do Usuário

O usuário **não é desenvolvedor**. Antes de pedir qualquer instalação, configuração de ferramenta, MCP, CLI, API ou aplicativo:

1. **Pesquise na web** o procedimento de instalação atual para Windows
2. **Forneça o passo a passo completo** — comando exato, onde executar, o que esperar
3. **Nunca assuma** que o usuário sabe o que é um terminal, onde colar um comando, ou o que uma mensagem de erro significa
4. Se houver múltiplas formas de instalar, **escolha a mais simples** e explique qual escolheu e por quê

Isso vale para: npm packages, MCPs, CLIs (gh, jq, etc.), extensões VS Code, configurações de sistema, variáveis de ambiente, e qualquer outra dependência.

## Arquitetura de Agentes

O projeto usa um padrão de agentes nativos do Claude Code com orquestrador central:

**Orquestrador** — planeja a tarefa, delega para os subagentes em paralelo, consolida os resultados e apresenta um resumo ao usuário para revisão e integração. Nunca entrega código diretamente — sempre passa pelo usuário antes de integrar.

**Subagentes disponíveis:**

| Agente | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| `backend` | `.claude/agents/backend.md` | Rotas Express, serviços, migrations Supabase |
| `frontend` | `.claude/agents/frontend.md` | Componentes React, hooks, páginas, Tailwind |
| `testes` | `.claude/agents/testes.md` | Testes unitários e de integração |
| `security-reviewer` | `.claude/agents/security-reviewer.md` | Auditoria de erros, segurança, RLS, tokens |

**Fluxo padrão:**
1. Usuário descreve a feature para o orquestrador
2. Orquestrador planeja e dispara subagentes em paralelo
3. Subagentes executam e reportam ao orquestrador
4. Orquestrador consolida e apresenta resumo ao usuário
5. Usuário revisa e integra

---

**Last Updated**: 2026-03-28 (sessão: Claude Code automations — hooks tsc+env, context7 MCP, skill nova-rota-backend, subagent security-reviewer)
