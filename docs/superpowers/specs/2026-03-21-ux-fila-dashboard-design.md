# Spec: UX — Fila de Diligências + Dashboard Operacional

**Data**: 2026-03-21
**Escopo**: Melhorias incrementais de UX em 2 arquivos existentes
**Arquivos afetados**: `src/pages/FilaDiligencias.tsx`, `src/pages/DashboardOperacional.tsx`

---

## Contexto

Ambas as páginas estão funcionais e bem estruturadas. Este spec cobre 3 melhorias pequenas identificadas em revisão de UX, sem alterar arquitetura ou lógica de negócio.

---

## Mudança 1 — Limpar filtros + contagem (FilaDiligencias)

**Problema**: Usuário não tem como limpar filtros ativos de uma vez. Não sabe quantos resultados estão visíveis vs. total.

**Solução**:
- Botão `Limpar filtros` aparece na barra de filtros quando `busca !== '' || filtroPrioridade !== '' || filtroStatus !== ''`
- Ao clicar: `setBusca('')`, `setFiltroPrioridade('')`, `setFiltroStatus('')`
- Texto de contagem no header da tabela (acima da `<Card>`): `"Exibindo X de Y diligências"` — visível somente quando `filtrada.length < lista.length`

**Componentes**: Nenhum novo. Apenas JSX em `FilaDiligencias.tsx`.

---

## Mudança 2 — Confirmação ao concluir (FilaDiligencias)

**Problema**: Botão "✓ Concluir" marca diligência como CONCLUÍDA sem confirmação — clique acidental é irreversível.

**Solução**:
- Novo estado local: `const [confirmarConclusao, setConfirmarConclusao] = useState<DiligenciaOperacional | null>(null)`
- Botão "✓ Concluir" chama `setConfirmarConclusao(d)` em vez de `concluir(d)` diretamente
- Modal inline (sem arquivo separado) exibido quando `confirmarConclusao !== null`:
  - Overlay escuro, card centralizado
  - Título: `"Confirmar conclusão"`
  - Texto: `"Marcar a diligência de [clienteNome ?? cnj] como concluída?"`
  - Botões: `Cancelar` (variant secondary) → `setConfirmarConclusao(null)` | `Confirmar` (variant primary, cor verde) → `concluir(confirmarConclusao); setConfirmarConclusao(null)`
  - **Não reutilizar `RetornoModal`** — este é um modal de confirmação simples, sem campos de formulário. Implementar como JSX inline no final de `FilaDiligencias.tsx`, antes do `RetornoModal` já existente.

**Componentes**: Nenhum novo. Modal inline em `FilaDiligencias.tsx`.

---

## Mudança 3 — Estado vazio inteligente (DashboardOperacional)

**Problema**: Quando não há diligências, o dashboard mostra 6 cards com "0" sem orientação sobre o que fazer.

**Solução**:
- Condição: `if (lista.length === 0)` → renderizar card único no lugar do grid
- Conteúdo do card vazio:
  - Ícone: `📋`
  - Título: `"Nenhuma diligência registrada"`
  - Texto: `"Abra um processo com gargalo detectado e clique em 'Gerar Diligência' para começar."`
  - Botão secundário: `"Ver Meus Processos"` → `navigate('/meus-processos')`
- Quando `lista.length > 0`: comportamento atual preservado integralmente

**Componentes**: Usa `Card`, `CardContent`, `Button` já importados.

---

## Restrições

- Zero novos arquivos
- Zero novas dependências
- TypeScript strict — sem `any`
- `npx tsc --noEmit` deve passar com zero erros após as mudanças

---

## Verificação

1. `npx tsc --noEmit` — zero erros
2. Fila sem filtros ativos → botão "Limpar" não aparece
3. Fila com filtro ativo → botão "Limpar" aparece, ao clicar reseta tudo
4. Contador "X de Y" aparece somente quando filtros reduzem a lista
5. Clicar "✓ Concluir" → modal de confirmação aparece
6. Modal: Cancelar → diligência permanece; Confirmar → status muda para CONCLUÍDA
7. Dashboard sem diligências → card orientativo com botão "Ver Meus Processos"
8. Dashboard com diligências → 6 cards + top-5 (sem alteração)
