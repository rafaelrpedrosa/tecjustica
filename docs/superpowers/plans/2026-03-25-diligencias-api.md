# Diligências API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `diligenciaService` from localStorage to a REST API backed by Supabase, with automatic one-time migration of existing local data and localStorage fallback when the backend is unreachable.

**Architecture:** New Supabase table `diligencias` stores all records persistently. Express backend exposes 5 endpoints under `/api/diligencias/*`. Frontend named-export functions become async — same function names, same call sites — tries the API first and falls back to localStorage on error. On the first successful `listarDiligencias()` call, any data still in localStorage is bulk-imported and then removed.

**Tech Stack:** Supabase (PostgreSQL), Express (`backend-server.js`), Axios (`apiClient` from `src/services/api.ts`), React, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/003_diligencias.sql` | Create | Table DDL + indexes + grants |
| `backend-server.js` | Modify | 5 new REST endpoints before `// Error handler` block |
| `src/services/diligencia.service.ts` | Rewrite | Async named-export functions, API-first + localStorage fallback + one-time migration |
| `src/pages/FilaDiligencias.tsx` | Modify | Await async service calls |
| `src/pages/DashboardOperacional.tsx` | Modify | Await async service calls |
| `src/pages/ProcessDetail.tsx` | Modify | Await async service calls |

---

## Task 1: Supabase Migration — `003_diligencias.sql`

**Files:**
- Create: `supabase/migrations/003_diligencias.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/003_diligencias.sql
CREATE TABLE diligencias (
  id               text PRIMARY KEY,
  cnj              text NOT NULL,
  cliente_nome     text,
  tipo_gargalo     text NOT NULL,
  descricao        text NOT NULL,
  prioridade       text NOT NULL CHECK (prioridade IN ('URGENTE','ALTA','NORMAL','MONITORAR')),
  dias_parado      integer NOT NULL,
  acao_recomendada text NOT NULL CHECK (acao_recomendada IN ('LIGACAO_SECRETARIA','LIGACAO_GABINETE','EMAIL_VARA','RECHECK')),
  status           text NOT NULL CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','SEM_RETORNO')),
  responsavel      text,
  data_criacao     text NOT NULL,
  data_prevista    text,
  data_execucao    text,
  retorno          text,
  proxima_acao     text,
  proxima_data     text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_diligencias_cnj    ON diligencias(cnj);
CREATE INDEX idx_diligencias_status ON diligencias(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON diligencias TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with:
- `project_id`: `jtvojfqjtwfwcvqocadk`
- `name`: `003_diligencias`
- `query`: (SQL above)

- [ ] **Step 3: Verify table exists**

Run via `execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'diligencias'
ORDER BY ordinal_position;
```
Expected: 17 rows (id through created_at).

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/003_diligencias.sql
git commit -m "feat: add diligencias table migration"
```

---

## Task 2: Backend — 5 REST Endpoints

**Files:**
- Modify: `backend-server.js` — insert the block below immediately before the `// Error handler` comment

**Notes:**
- Backend Supabase variable is `supabase` (declared at line 115)
- All route paths must start with `/api/` (matches frontend `apiClient` base URL convention)
- `DELETE` method is already in backend CORS config — no change needed

- [ ] **Step 1: Add camelCase helper + 5 endpoints**

Find the `// Error handler` comment in `backend-server.js` and insert this block immediately before it:

```javascript
// ─── Diligências ──────────────────────────────────────────────────────────────

function diligenciaToCamel(d) {
  return {
    id:              d.id,
    cnj:             d.cnj,
    clienteNome:     d.cliente_nome ?? undefined,
    tipoGargalo:     d.tipo_gargalo,
    descricao:       d.descricao,
    prioridade:      d.prioridade,
    diasParado:      d.dias_parado,
    acaoRecomendada: d.acao_recomendada,
    status:          d.status,
    responsavel:     d.responsavel ?? undefined,
    dataCriacao:     d.data_criacao,
    dataPrevista:    d.data_prevista ?? undefined,
    dataExecucao:    d.data_execucao ?? undefined,
    retorno:         d.retorno ?? undefined,
    proximaAcao:     d.proxima_acao ?? undefined,
    proximaData:     d.proxima_data ?? undefined,
  };
}

function diligenciaToSnake(d) {
  return {
    id:               d.id,
    cnj:              d.cnj,
    cliente_nome:     d.clienteNome ?? null,
    tipo_gargalo:     d.tipoGargalo,
    descricao:        d.descricao,
    prioridade:       d.prioridade,
    dias_parado:      d.diasParado,
    acao_recomendada: d.acaoRecomendada,
    status:           d.status,
    responsavel:      d.responsavel ?? null,
    data_criacao:     d.dataCriacao,
    data_prevista:    d.dataPrevista ?? null,
    data_execucao:    d.dataExecucao ?? null,
    retorno:          d.retorno ?? null,
    proxima_acao:     d.proximaAcao ?? null,
    proxima_data:     d.proximaData ?? null,
  };
}

// GET /api/diligencias
app.get('/api/diligencias', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .select('*')
      .order('data_criacao', { ascending: false });
    if (error) {
      console.error('Erro GET /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao listar diligências.' });
    }
    res.json(data.map(diligenciaToCamel));
  } catch (err) {
    console.error('Erro GET /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao listar diligências.' });
  }
});

// GET /api/diligencias/cnj/:cnj
app.get('/api/diligencias/cnj/:cnj', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const cnj = decodeURIComponent(req.params.cnj);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .select('*')
      .eq('cnj', cnj)
      .order('data_criacao', { ascending: false });
    if (error) {
      console.error('Erro GET /api/diligencias/cnj:', error.message);
      return res.status(500).json({ error: 'Erro interno ao listar diligências por CNJ.' });
    }
    res.json(data.map(diligenciaToCamel));
  } catch (err) {
    console.error('Erro GET /api/diligencias/cnj:', err.message);
    res.status(500).json({ error: 'Erro interno ao listar diligências por CNJ.' });
  }
});

// POST /api/diligencias — cria uma ou várias (array aceito para migração em lote)
app.post('/api/diligencias', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const input = req.body;
  const items = Array.isArray(input) ? input : [input];
  const rows = items.map(diligenciaToSnake);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .upsert(rows, { onConflict: 'id' })
      .select();
    if (error) {
      console.error('Erro POST /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao criar diligência.' });
    }
    const result = data.map(diligenciaToCamel);
    res.status(201).json(Array.isArray(input) ? result : result[0]);
  } catch (err) {
    console.error('Erro POST /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao criar diligência.' });
  }
});

// PUT /api/diligencias/:id
app.put('/api/diligencias/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { id } = req.params;
  const updates = diligenciaToSnake({ id, ...req.body });
  // Remove undefined/null fields to avoid overwriting with null
  Object.keys(updates).forEach(k => updates[k] === null && delete updates[k]);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Erro PUT /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao atualizar diligência.' });
    }
    res.json(diligenciaToCamel(data));
  } catch (err) {
    console.error('Erro PUT /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao atualizar diligência.' });
  }
});

// DELETE /api/diligencias/:id
app.delete('/api/diligencias/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('diligencias')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Erro DELETE /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao excluir diligência.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro DELETE /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao excluir diligência.' });
  }
});
```

- [ ] **Step 2: Restart backend and verify**

```bash
node backend-server.js
```

Test:
```bash
curl http://localhost:3001/api/diligencias
# Expected: []  (status 200)
```

- [ ] **Step 3: Commit**
```bash
git add backend-server.js
git commit -m "feat: add /api/diligencias REST endpoints"
```

---

## Task 3: Rewrite `diligencia.service.ts` — Async Named Exports

**Files:**
- Rewrite: `src/services/diligencia.service.ts`

**Key rules:**
- Keep the same **5 function names** (`listarDiligencias`, `listarDiligenciasPorCNJ`, `salvarDiligencia`, `atualizarDiligencia`, `excluirDiligencia`) — callers don't change names, only add `await`
- Every function tries the API first; falls back to localStorage on any error
- `listarDiligencias()` calls `migrateLocalIfNeeded()` after a successful API response
- Migration flag `'rpatec_diligencias_migrated'` prevents re-runs

- [ ] **Step 1: Rewrite the file**

```typescript
// src/services/diligencia.service.ts
// TODO: migrar para API REST em /api/diligencias ✅ feito em 2026-03-25

import { apiClient } from '@/services/api'
import type { DiligenciaOperacional } from '@/types/diligencia'

const STORAGE_KEY = 'rpatec_diligencias'
const MIGRATION_FLAG = 'rpatec_diligencias_migrated'

function getLocal(): DiligenciaOperacional[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DiligenciaOperacional[]) : []
  } catch {
    return []
  }
}

async function migrateLocalIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return
  const local = getLocal()
  if (local.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, '1')
    return
  }
  try {
    await apiClient.post('/api/diligencias', local)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.setItem(MIGRATION_FLAG, '1')
    console.info(`[diligencias] Migrados ${local.length} registros do localStorage para a API.`)
  } catch (err) {
    console.warn('[diligencias] Falha ao migrar localStorage — será tentado novamente.', err)
  }
}

export async function listarDiligencias(): Promise<DiligenciaOperacional[]> {
  try {
    const res = await apiClient.get<DiligenciaOperacional[]>('/api/diligencias')
    await migrateLocalIfNeeded()
    return res.data
  } catch {
    return getLocal()
  }
}

export async function listarDiligenciasPorCNJ(cnj: string): Promise<DiligenciaOperacional[]> {
  try {
    const res = await apiClient.get<DiligenciaOperacional[]>(
      `/api/diligencias/cnj/${encodeURIComponent(cnj)}`
    )
    return res.data
  } catch {
    return getLocal().filter((d) => d.cnj === cnj)
  }
}

export async function salvarDiligencia(
  diligencia: DiligenciaOperacional
): Promise<DiligenciaOperacional> {
  try {
    const res = await apiClient.post<DiligenciaOperacional>('/api/diligencias', diligencia)
    return res.data
  } catch {
    const lista = getLocal()
    lista.push(diligencia)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
    return diligencia
  }
}

export async function atualizarDiligencia(
  id: string,
  updates: Partial<DiligenciaOperacional>
): Promise<void> {
  try {
    await apiClient.put(`/api/diligencias/${id}`, updates)
  } catch {
    const lista = getLocal().map((d) => (d.id === id ? { ...d, ...updates } : d))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
  }
}

export async function excluirDiligencia(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/diligencias/${id}`)
  } catch {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getLocal().filter((d) => d.id !== id))
    )
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expect errors in the 3 caller files (FilaDiligencias, DashboardOperacional, ProcessDetail) — those are fixed in Task 4. Zero errors in `diligencia.service.ts` itself.

- [ ] **Step 3: Commit**
```bash
git add src/services/diligencia.service.ts
git commit -m "feat: migrate diligenciaService to async API-first with localStorage fallback"
```

---

## Task 4: Update Callers

**Background:** All 3 pages call the 5 service functions synchronously. With the service now async, every call must be `await`-ed inside an `async` function or `.then()`. The pattern differs depending on how each page currently calls the service:

**Pattern A — synchronous state init (most common):**
```typescript
// Before
const [lista, setLista] = useState<DiligenciaOperacional[]>(listarDiligencias())

// After
const [lista, setLista] = useState<DiligenciaOperacional[]>([])
useEffect(() => {
  listarDiligencias().then(setLista)
}, [])
```

**Pattern B — sync call inside event handler:**
```typescript
// Before
const handleConcluir = (d: DiligenciaOperacional) => {
  atualizarDiligencia(d.id, { status: 'CONCLUIDA' })
  recarregar()
}

// After
const handleConcluir = async (d: DiligenciaOperacional) => {
  await atualizarDiligencia(d.id, { status: 'CONCLUIDA' })
  await recarregar()
}
```

**Pattern C — sync reload function:**
```typescript
// Before
const recarregar = () => setLista(listarDiligencias())

// After
const recarregar = async () => {
  const data = await listarDiligencias()
  setLista(data)
}
```

**Files:**
- Modify: `src/pages/FilaDiligencias.tsx`
- Modify: `src/pages/DashboardOperacional.tsx`
- Modify: `src/pages/ProcessDetail.tsx`

- [ ] **Step 1: Read each file and apply the async patterns above**

For each file:
1. Find every direct call to `listarDiligencias`, `listarDiligenciasPorCNJ`, `salvarDiligencia`, `atualizarDiligencia`, `excluirDiligencia`
2. Apply Pattern A/B/C as appropriate for each call site
3. Add `async` to any function that now contains `await`
4. Add `import type { DiligenciaOperacional }` if not already imported

- [ ] **Step 2: Run TypeScript check — must reach 0 errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors across all files.

- [ ] **Step 3: Commit**
```bash
git add src/pages/FilaDiligencias.tsx src/pages/DashboardOperacional.tsx src/pages/ProcessDetail.tsx
git commit -m "fix: await async diligenciaService calls in FilaDiligencias, DashboardOperacional, ProcessDetail"
```

---

## Task 5: End-to-End Verification

- [ ] **Step 1: Ensure both servers are running**

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend (restart required after Task 2)
node backend-server.js
```

- [ ] **Step 2: Open `/diligencias`**
  - Page loads without errors or blank screen
  - If localStorage had data → check browser console for `[diligencias] Migrados X registros`
  - After load: `localStorage.getItem('rpatec_diligencias')` should be `null`
  - `localStorage.getItem('rpatec_diligencias_migrated')` should be `'1'`

- [ ] **Step 3: Create a new diligência**
  - Open a process with a bottleneck → click "Gerar Diligência"
  - Verify it appears in `/diligencias`
  - Open Supabase dashboard → table `diligencias` → confirm row exists

- [ ] **Step 4: Test actions**
  - Click "▶ Iniciar" → status changes to `EM_ANDAMENTO`, persists on refresh
  - Click "✓ Concluir" → status changes to `CONCLUIDA`, persists on refresh

- [ ] **Step 5: Test fallback (backend offline)**
  - Stop `backend-server.js`
  - Reload `/diligencias` → page renders without crash (localStorage fallback)
  - Network errors appear in console but no uncaught exceptions

- [ ] **Step 6: Final TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: Phase 4 complete — diligências persisted in Supabase via /api/diligencias"
```
