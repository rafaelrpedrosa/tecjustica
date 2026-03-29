# UX Fila + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar "Limpar filtros" + contador de resultados na Fila de Diligências, confirmação antes de concluir uma diligência, e estado vazio orientativo no Dashboard Operacional.

**Architecture:** Todas as mudanças são JSX/state local dentro de 2 componentes React existentes. Nenhum novo arquivo, nenhuma nova dependência, nenhuma alteração de API ou service layer.

**Tech Stack:** React 18, TypeScript 5.3, Tailwind CSS

---

## File Map

| Arquivo | O que muda |
|---------|-----------|
| `src/pages/FilaDiligencias.tsx` | +botão Limpar filtros, +contador, +modal inline de confirmação |
| `src/pages/DashboardOperacional.tsx` | +estado vazio quando `lista.length === 0` |

---

### Task 1: Limpar filtros + contador de resultados (FilaDiligencias)

**Files:**
- Modify: `src/pages/FilaDiligencias.tsx`

- [ ] **Step 1: Adicionar função `limparFiltros` e variável `filtrosAtivos`**

Localizar o bloco de estados (linhas ~68-71) e adicionar logo após `filtrada`:

```tsx
const filtrosAtivos = !!(busca || filtroPrioridade || filtroStatus)

function limparFiltros() {
  setBusca('')
  setFiltroPrioridade('')
  setFiltroStatus('')
}
```

- [ ] **Step 2: Adicionar botão "Limpar" na barra de filtros**

Dentro do `<div className="flex flex-wrap gap-3">` (após os dois `<select>`), adicionar:

```tsx
{filtrosAtivos && (
  <button
    onClick={limparFiltros}
    className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
  >
    ✕ Limpar filtros
  </button>
)}
```

- [ ] **Step 3: Adicionar contador de resultados acima da tabela**

Substituir o comentário `{/* Tabela */}` pelo seguinte bloco antes do `{filtrada.length === 0 ? ...}`:

```tsx
{/* Contador de resultados */}
{filtrosAtivos && filtrada.length < lista.length && (
  <p className="text-sm text-gray-500">
    Exibindo <span className="font-medium">{filtrada.length}</span> de{' '}
    <span className="font-medium">{lista.length}</span> diligência{lista.length !== 1 ? 's' : ''}
  </p>
)}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd C:\Users\rafae\Documents\Tools\TecJustica && npx tsc --noEmit
```
Esperado: zero erros.

- [ ] **Step 5: Verificação manual**
- Abrir `/diligencias` sem filtros → botão "Limpar" não aparece, sem contador
- Digitar algo na busca → botão "Limpar" aparece
- Com filtro ativo que reduz resultados → contador "Exibindo X de Y" aparece
- Clicar "Limpar" → todos os campos resetam, botão some

---

### Task 2: Confirmação ao concluir diligência (FilaDiligencias)

**Files:**
- Modify: `src/pages/FilaDiligencias.tsx`

- [ ] **Step 1: Adicionar estado `confirmarConclusao`**

Adicionar após `const [modalDiligencia, setModalDiligencia] = useState<DiligenciaOperacional | null>(null)`:

```tsx
const [confirmarConclusao, setConfirmarConclusao] = useState<DiligenciaOperacional | null>(null)
```

- [ ] **Step 2: Modificar botão "✓ Concluir" para abrir confirmação**

Localizar o botão `✓ Concluir` (linha ~231) e substituir `onClick={() => concluir(d)}` por `onClick={() => setConfirmarConclusao(d)}`:

```tsx
<button
  onClick={() => setConfirmarConclusao(d)}
  className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
>
  ✓ Concluir
</button>
```

- [ ] **Step 3: Adicionar modal de confirmação inline**

Adicionar logo antes do `{modalDiligencia && (<RetornoModal .../>)}` no final do JSX:

```tsx
{confirmarConclusao && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar conclusão</h3>
      <p className="text-sm text-gray-600 mb-6">
        Marcar a diligência de{' '}
        <span className="font-medium">
          {confirmarConclusao.clienteNome ?? confirmarConclusao.cnj}
        </span>{' '}
        como concluída?
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setConfirmarConclusao(null)}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => { concluir(confirmarConclusao); setConfirmarConclusao(null) }}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: zero erros.

- [ ] **Step 5: Verificação manual**
- Clicar "✓ Concluir" em qualquer diligência → modal aparece com nome/CNJ correto
- Clicar "Cancelar" → modal fecha, status não muda
- Clicar "Confirmar" → modal fecha, linha desaparece (ou status muda para CONCLUÍDA)

- [ ] **Step 6: Commit Tasks 1 + 2**

```bash
git add src/pages/FilaDiligencias.tsx
git commit -m "feat(fila): limpar filtros, contador de resultados e confirmação ao concluir"
```

---

### Task 3: Estado vazio inteligente no Dashboard (DashboardOperacional)

**Files:**
- Modify: `src/pages/DashboardOperacional.tsx`

- [ ] **Step 1: Envolver o conteúdo principal com condição `lista.length === 0`**

Localizar o `return (` do componente. Após o bloco do header (`</div>` que fecha o flex justify-between), adicionar a condição antes do grid de métricas:

```tsx
{lista.length === 0 ? (
  <Card>
    <CardContent className="py-16 text-center">
      <p className="text-5xl mb-4">📋</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Nenhuma diligência registrada
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Abra um processo com gargalo detectado e clique em{' '}
        <span className="font-medium">"Gerar Diligência"</span> para começar.
      </p>
      <Button variant="secondary" size="sm" onClick={() => navigate('/meus-processos')}>
        Ver Meus Processos
      </Button>
    </CardContent>
  </Card>
) : (
  <>
    {/* Grid de métricas — conteúdo existente */}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {/* ... cards existentes sem alteração ... */}
    </div>

    {/* Top 5 urgentes — sem alteração */}
    <Card>
      {/* ... conteúdo existente sem alteração ... */}
    </Card>
  </>
)}
```

> **Atenção**: Não reescrever os cards — mover o JSX existente para dentro do `<>...</>`. Nenhuma linha de métrica ou top-5 deve mudar.

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: zero erros.

- [ ] **Step 3: Verificação manual**
- Com 0 diligências no localStorage → card orientativo visível, sem os 6 cards de métricas
- Clicar "Ver Meus Processos" → navega para `/meus-processos`
- Gerar uma diligência em qualquer processo → voltar ao Dashboard → 6 cards e top-5 aparecem normalmente

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardOperacional.tsx
git commit -m "feat(dashboard): estado vazio orientativo quando não há diligências"
```

---

## Verificação Final

- [ ] `npx tsc --noEmit` — zero erros
- [ ] Fila sem filtros: sem botão "Limpar", sem contador
- [ ] Fila com filtro: botão "Limpar" visível; contador aparece quando filtrada < total
- [ ] "✓ Concluir": abre modal; Cancelar preserva; Confirmar conclui
- [ ] Dashboard vazio: card orientativo com botão para Meus Processos
- [ ] Dashboard com dados: comportamento original intacto
- [ ] `git log --oneline -3` mostra 2 commits novos
