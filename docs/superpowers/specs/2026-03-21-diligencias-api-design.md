# Spec: Fase 4 — Persistência de Diligências em API REST + Supabase

**Data**: 2026-03-21
**Escopo**: Migrar `diligencia.service.ts` de localStorage para API REST + Supabase, com fallback e migração automática de dados existentes
**Arquivos afetados**: `supabase/migrations/003_diligencias.sql`, `backend-server.js`, `src/services/diligencia.service.ts`

---

## Contexto

O módulo de diligências opera inteiramente em localStorage (`'rpatec_diligencias'`). Isso impede compartilhamento entre dispositivos/usuários e não escala para múltiplos advogados. Esta fase migra a persistência para Supabase via backend REST, mantendo a interface pública do service intacta.

**Componentes não alterados**: `FilaDiligencias.tsx`, `DashboardOperacional.tsx`, `RetornoModal.tsx`, `ProcessDetail.tsx`, `diligencia.ts` (tipos).

---

## Arquitetura

```
FilaDiligencias / DashboardOperacional / ProcessDetail
       ↓  (interface pública idêntica)
diligencia.service.ts  ← único arquivo frontend que muda
       ↓ tenta API
backend-server.js  ← 5 novos endpoints /api/diligencias/*
       ↓
Supabase: tabela diligencias  ← 003_diligencias.sql
       ↑ fallback se API falhar
localStorage (somente leitura, descartado após migração automática)
```

**Estratégia**: API-first. Se a chamada à API falhar (rede, backend fora), leitura cai no localStorage como fallback. Escrita em modo degradado loga o erro mas não quebra o UI. Migração automática ocorre na primeira chamada bem-sucedida.

---

## Mudança 1 — Migration SQL (`003_diligencias.sql`)

```sql
CREATE TABLE diligencias (
  id               text PRIMARY KEY,
  cnj              text NOT NULL,
  cliente_nome     text,
  tipo_gargalo     text NOT NULL,
  descricao        text NOT NULL,
  prioridade       text NOT NULL CHECK (prioridade IN ('URGENTE','ALTA','NORMAL','MONITORAR')),
  dias_parado      integer NOT NULL,
  acao_recomendada text NOT NULL,
  status           text NOT NULL CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','SEM_RETORNO')),
  responsavel      text,
  data_criacao     timestamptz NOT NULL,
  data_prevista    date,
  data_execucao    date,
  retorno          text,
  proxima_acao     text,
  proxima_data     date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_diligencias_cnj ON diligencias(cnj);
CREATE INDEX idx_diligencias_status ON diligencias(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON diligencias TO anon, authenticated, service_role;
```

**Nota**: `id` é `text` (não UUID gerado pelo banco) para preservar IDs existentes criados com `crypto.randomUUID()` no cliente.

---

## Mudança 2 — Endpoints Backend (`backend-server.js`)

5 novos endpoints após os endpoints de escritório existentes:

| Método | Rota | Comportamento |
|--------|------|---------------|
| `GET` | `/api/diligencias` | Lista todas. Query param opcional: `?responsavel=<valor>` |
| `POST` | `/api/diligencias` | Aceita objeto único **ou array** (migração). Array usa upsert com `onConflict: 'id'` — idempotente |
| `PUT` | `/api/diligencias/:id` | Atualiza somente os campos enviados no body — Supabase `.update()` é parcial por padrão, sem fetch prévio necessário |
| `DELETE` | `/api/diligencias/:id` | Remove por ID |
| `GET` | `/api/diligencias/cnj/:cnj` | Lista todas as diligências de um CNJ |

> **Atenção Express**: registrar `/api/diligencias/cnj/:cnj` **antes** de qualquer rota `/:id` para evitar que Express interprete `"cnj"` como valor de `:id`.

**Conversão de campos**: backend recebe camelCase do frontend, persiste snake_case no Supabase, retorna camelCase. Mesmo padrão dos endpoints `/api/escritorio/*`.

**Mapeamento camelCase ↔ snake_case**:

| Frontend (camelCase) | Supabase (snake_case) |
|----------------------|-----------------------|
| `clienteNome` | `cliente_nome` |
| `tipoGargalo` | `tipo_gargalo` |
| `diasParado` | `dias_parado` |
| `acaoRecomendada` | `acao_recomendada` |
| `dataCriacao` | `data_criacao` |
| `dataPrevista` | `data_prevista` |
| `dataExecucao` | `data_execucao` |
| `proximaAcao` | `proxima_acao` |
| `proximaData` | `proxima_data` |

**Tratamento de erros** (padrão obrigatório do projeto):
```js
if (error) {
  console.error('Erro em /api/diligencias:', error.message)
  return res.status(500).json({ error: 'Erro interno ao processar operação.' })
}
```

---

## Mudança 3 — `diligencia.service.ts` refatorado

### Interface pública — sem alteração

```ts
listarDiligencias(): Promise<DiligenciaOperacional[]>
listarDiligenciasPorCNJ(cnj: string): Promise<DiligenciaOperacional[]>
salvarDiligencia(d: Omit<DiligenciaOperacional, 'id'>): Promise<DiligenciaOperacional>
atualizarDiligencia(id: string, updates: Partial<DiligenciaOperacional>): Promise<void>
excluirDiligencia(id: string): Promise<void>
```

Funções viram `async` (antes eram síncronas). Os componentes que consomem estas funções já usam `useEffect` com estado local — a mudança para async é transparente.

### Lógica interna

```ts
// listarDiligencias
async function listarDiligencias(): Promise<DiligenciaOperacional[]> {
  try {
    const res = await apiClient.get('/api/diligencias')
    await migrarLocalStorageSeNecessario()  // migração one-shot
    return res.data
  } catch {
    return lerDoLocalStorage()  // fallback de leitura
  }
}

// salvarDiligencia
async function salvarDiligencia(d): Promise<DiligenciaOperacional> {
  const nova = { ...d, id: crypto.randomUUID() }
  try {
    const res = await apiClient.post('/api/diligencias', nova)
    return res.data
  } catch {
    console.error('Backend indisponível — salvando localmente')
    salvarNoLocalStorage(nova)
    return nova
  }
}
```

### Migração automática (one-shot)

```ts
async function migrarLocalStorageSeNecessario(): Promise<void> {
  if (localStorage.getItem('rpatec_diligencias_migrated')) return
  const local: DiligenciaOperacional[] = JSON.parse(
    localStorage.getItem('rpatec_diligencias') ?? '[]'
  )
  if (local.length === 0) {
    localStorage.setItem('rpatec_diligencias_migrated', 'true')
    return
  }
  await apiClient.post('/api/diligencias', local)  // POST em lote — backend usa upsert onConflict: 'id'
  localStorage.setItem('rpatec_diligencias_migrated', 'true')
  localStorage.removeItem('rpatec_diligencias')
}
```

Flag `'rpatec_diligencias_migrated'` garante execução única mesmo se o usuário recarregar a página.

---

## Restrições

- Zero alterações nos componentes React (FilaDiligencias, DashboardOperacional, RetornoModal, ProcessDetail)
- Zero alterações nos tipos (`src/types/diligencia.ts`)
- TypeScript strict — sem `any`
- `npx tsc --noEmit` deve passar com zero erros após as mudanças
- Padrão de erro do backend: nunca expor `error.message` ao cliente

---

## Verificação

1. `npx tsc --noEmit` — zero erros
2. Abrir `/diligencias` com backend rodando → diligências carregam da API
3. Criar nova diligência → aparece na fila, confirmável no Supabase (tabela `diligencias`)
4. Parar o backend → abrir `/diligencias` → fallback exibe dados do localStorage
5. Com dados no localStorage e backend rodando → primeiro acesso migra automaticamente, localStorage limpo
6. `GET /api/diligencias?responsavel=Rafael` → filtra por responsável
7. `GET /api/diligencias/cnj/0000000-00.0000.0.00.0000` → lista por CNJ
