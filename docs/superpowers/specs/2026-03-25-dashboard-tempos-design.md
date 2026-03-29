# Dashboard de Tempos Processuais — Spec de Design

**Data:** 2026-03-25
**Rota:** `/dashboard-tempos`
**Status:** Aprovado para implementação

---

## Problema

O escritório não tem visibilidade sobre quanto tempo cada fase processual leva. Sem essa informação, é impossível identificar gargalos sistêmicos por tribunal ou tipo de ação, ou comparar performance entre jurisdições.

## Objetivo

Criar uma página que agrega métricas de tempo processual a partir dos processos monitorados em `escritorio_processos`, cruzando com movimentos cacheados em `process_movements`.

---

## Dados Disponíveis

| Tabela | Campos usados |
|--------|---------------|
| `escritorio_processos` | `cnj` |
| `processes` | `cnj`, `tribunal`, `classe`, `data_abertura` |
| `process_movements` | `data`, `descricao` (via FK `process_id → processes.id`) |

**Limitação conhecida:** O campo `tribunal` armazena o sistema judiciário (TJPE, TRF5, TRT6), não a comarca individual. A UI rotula como "Por Tribunal".

**Limitação de cobertura:** Apenas processos que foram abertos no sistema têm movimentos cacheados. Processos sem movimentos aparecem no total mas não nas médias.

---

## Métricas Calculadas

Todas as métricas são calculadas no backend (JavaScript pós-query), não via SQL.

### 1. Distribuição → Sentença (por tribunal)
- **De:** `processes.data_abertura`
- **Até:** primeiro movimento com padrão de sentença: `['sentença', 'julgado', 'procedente', 'improcedente', 'dispositivo', 'resolv']`
- **Resultado:** média de dias por tribunal

### 2. Sentença → Liquidação (por tribunal)
- **De:** data do movimento de sentença
- **Até:** primeiro movimento após a sentença com padrão: `['liquidação', 'cumprimento de sentença', 'execução de título', 'cálculo de liquidação', 'rpv', 'precatório', 'requisição de pagamento']`
- **Resultado:** média de dias por tribunal

### 3. Tempo total do processo (por tipo de ação)
- **De:** `processes.data_abertura`
- **Até:** data do último movimento cacheado
- **Agrupado por:** `processes.classe`
- **Resultado:** média de dias por tipo de ação

### Cards de resumo (4)
- Total de processos monitorados no período
- Processos com sentença detectada
- Processos em fase de liquidação
- Média geral de dias (todos os processos com movimentos)

---

## Filtro de Período

`GET /api/escritorio/metricas-tempo?periodo=6m|1a|tudo`

Filtra por `processes.data_abertura >= data_limite`. Padrão: `tudo`.

UI: `<select>` com opções "Últimos 6 meses", "Último ano", "Todo período".

---

## Layout (validado pelo usuário)

```
┌─────────────────────────────────────────────────────┐
│ Tempos Processuais             [Período ▾] [Btn]    │
├─────────┬─────────┬──────────────┬──────────────────┤
│ 12      │ 8       │ 3            │ 420d             │
│ Processos│Com Sent.│Em Liquidação│ Média Geral      │
├─────────────────────────┬───────────────────────────┤
│  📊 Por Tribunal        │  ⚖️ Por Tipo de Ação      │
│  [Bar chart recharts]   │  [Tabela: Tipo|N|Média]   │
│                         │                           │
└─────────────────────────┴───────────────────────────┘
```

Gráfico de barras: 2 séries por tribunal (azul = Dist→Sent, verde = Sent→Liquid).

---

## Estados da Página

| Estado | Trigger | UI |
|--------|---------|-----|
| Loading | Requisição em andamento | `<Spinner />` centralizado |
| Erro | Falha na API | Card com texto vermelho |
| Vazio | Nenhum processo no escritório | `<Empty />` com link para Meus Processos |
| Sem dados no gráfico | Processos sem movimentos no período | Texto informativo na área do gráfico |
| Normal | Dados disponíveis | Layout completo |

---

## Arquitetura

### Backend (`backend-server.js`)
Nova rota `GET /api/escritorio/metricas-tempo`:
1. Busca CNJs de `escritorio_processos`
2. Faz nested select: `processes` com `process_movements` aninhados (FK existente)
3. Aplica filtro de período em `data_abertura`
4. Itera processos em JS, detecta fases por palavras-chave em `descricao`
5. Agrupa e calcula médias por tribunal e por tipo
6. Retorna JSON `{ porTribunal[], porTipoAcao[], resumo }`

Padrão de erro obrigatório: `console.error(msg)` + `res.status(500).json({ error: 'Erro interno ao processar operação.' })`.

### Frontend
- **Tipos:** 4 novas interfaces em `src/types/escritorio.ts`
- **Service:** `listarMetricasTempo(periodo)` em `src/services/escritorio.service.ts` (usa `apiClient`)
- **Página:** `src/pages/DashboardTempos.tsx` — estado local (sem React Query, dados não precisam de cache)
- **Rota:** `/dashboard-tempos` em `src/App.tsx`
- **Nav:** link "⏱ Tempos" após `/dashboard-operacional` em `Navigation.tsx`

### Dependência nova
`recharts` — não está no `package.json`. Instalar como primeiro passo.

---

## TypeScript

Interfaces novas em `src/types/escritorio.ts`:
```typescript
TribunalMetrica { tribunal, mediaDistribuicaoSentenca, mediaSentencaLiquidacao, totalComSentenca, totalEmLiquidacao }
TipoAcaoMetrica { tipoAcao, totalProcessos, mediaTempoTotal }
ResumoMetrica { totalProcessos, processosComMovimentos, processosComSentenca, processosEmLiquidacao, mediaGeralDias }
MetricasTempo { porTribunal, porTipoAcao, resumo }
```
Campos de dias são `number | null` (null = sem dados suficientes).

---

## Verificação

1. `npm install recharts` → sem erros
2. `npx tsc --noEmit` → zero erros
3. `GET /api/escritorio/metricas-tempo?periodo=tudo` → JSON válido
4. `/dashboard-tempos` → 4 cards + gráfico lado a lado + tabela
5. Trocar período → dados recarregam
6. Escritório vazio → Empty state
7. Processos sem movimentos → aparecem no total, não nas médias
