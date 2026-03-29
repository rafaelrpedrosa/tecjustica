# Design Spec — Redesign Profissional JusFlow

**Data:** 2026-03-26
**Status:** Aprovado pelo usuário

---

## Objetivo

Substituir o visual genérico atual ("cara de IA") por um design system profissional, coerente e adequado a um sistema jurídico de alto padrão. Foco em: espaçamento otimizado, tipografia refinada, hierarquia visual clara, cores sóbrias.

---

## Decisões de Design (aprovadas via visual companion)

### 1. Estrutura de Layout

**Sidebar lateral fixa + light mode**

- Remover o layout atual de `Header + Navigation horizontal`
- Substituir por sidebar fixa à esquerda (220px) com navegação vertical
- Fundo da sidebar: `#ffffff` com borda direita sutil `#e8edf2`
- Fundo do conteúdo principal: `#f8fafc` (off-white, não branco puro)
- Topbar interna por página (não global): fundo branco, borda inferior, breadcrumb + ações

### 2. Paleta de Cores

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#f8fafc` | Fundo geral do conteúdo |
| `--color-surface` | `#ffffff` | Cards, sidebar, topbar |
| `--color-border` | `#e8edf2` | Bordas de cards e divisores |
| `--color-border-subtle` | `#f1f5f9` | Separadores internos |
| `--color-primary` | `#1e3a5f` | Cor primária (navy) — botões, links ativos, logo |
| `--color-primary-bg` | `#f0f4f8` | Background do item ativo na nav |
| `--color-text-strong` | `#1e293b` | Títulos e texto de alto contraste |
| `--color-text` | `#475569` | Texto de corpo padrão |
| `--color-text-muted` | `#94a3b8` | Labels, meta, timestamps |
| `--color-text-faint` | `#cbd5e1` | Placeholders, separadores |
| `--color-danger` | `#dc2626` | Alertas críticos |
| `--color-danger-bg` | `#fee2e2` | Badge de alerta |
| `--color-success` | `#16a34a` | Status positivo |
| `--color-warning` | `#d97706` | Status de atenção |

**Proibido:** roxo, gradiente azul-roxo, `blue-600` Tailwind puro, `gray-50` como fundo único.

### 3. Tipografia

**Fonte:** Geist (Vercel) — importada via Google Fonts ou CDN npx

```css
font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Escala tipográfica:**

| Uso | Tamanho | Peso | Cor |
|---|---|---|---|
| Títulos de página | `18px` | `600` | `--color-text-strong` |
| Subtítulos / card headers | `13-14px` | `600` | `--color-text-strong` |
| Corpo | `13px` | `400` | `--color-text` |
| Labels uppercase | `10px` | `600` + `letter-spacing: 0.8px` | `--color-text-muted` |
| Números CNJ | `11-12px` | `500` | `--color-primary` |
| Meta / timestamps | `11px` | `400` | `--color-text-faint` |

**Proibido:** Inter, Roboto, Arial, system-ui sem fallback refinado.

### 4. Componentes Principais

#### Sidebar (Layout.tsx + Navigation.tsx)
- Largura: `220px`, fixa
- Logo: ícone navy `#1e3a5f` 26×26px + texto "JusFlow" + subtítulo "Sistema Jurídico"
- Seções com label uppercase muted (`CONSULTA`, `GESTÃO`, `ANALYTICS`)
- Item ativo: `background: #f0f4f8`, `color: #1e3a5f`, `font-weight: 500`
- Item inativo: `color: #64748b`, hover `#f8fafc`
- Ícones SVG inline (não emojis) — 15×15px
- Badges de alerta: `background: #fee2e2`, `color: #dc2626`
- Footer com avatar e email do usuário

#### Cards (Card.tsx)
- `background: #ffffff`
- `border: 1px solid #e8edf2`
- `border-radius: 8px`
- Padding interno: `16-20px`
- Sem `shadow-sm` excessivo — apenas `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`

#### Botões (Button.tsx)
- Primary: `background: #1e3a5f`, `color: #fff`, `border-radius: 6px`, `padding: 6px 14px`, `font-size: 13px`
- Secondary/Ghost: `background: #fff`, `border: 1px solid #e2e8f0`, `color: #64748b`
- Sem gradientes, sem sombras chamativas

#### Inputs
- `background: #f8fafc`
- `border: 1px solid #e2e8f0`
- `border-radius: 6px`
- Focus: `border-color: #1e3a5f` (sem `ring` azul brilhante padrão)
- Fonte: Geist monospace para campos CNJ/CPF

#### Badges / Status
- Status dots: `6px`, cores suaves (`#86efac`, `#fcd34d`, `#fca5a5`)
- Tags de texto: fundo suave + cor correspondente, `border-radius: 4px`

### 5. Layout Geral (Layout.tsx)

```
┌─────────────────────────────────────────────────┐
│  Sidebar (220px)  │  Main Content               │
│                   │  ┌─────────────────────────┐│
│  [Logo]           │  │ Topbar (título + ações)  ││
│                   │  └─────────────────────────┘│
│  CONSULTA         │  ┌─────────────────────────┐│
│  · Buscar         │  │                         ││
│  · CPF            │  │  Conteúdo da página      ││
│  · Precedentes    │  │  (padding 18-20px)       ││
│                   │  │                         ││
│  GESTÃO           │  └─────────────────────────┘│
│  · Meus Process.  │                             │
│  · Diligências    │                             │
│  · Clientes       │                             │
│                   │                             │
│  ANALYTICS        │                             │
│  · Dashboard      │                             │
│  · Tempos         │                             │
│  · IA             │                             │
│                   │                             │
│  [User footer]    │                             │
└─────────────────────────────────────────────────┘
```

### 6. Tailwind Config

Substituir as cores genéricas do `tailwind.config.js`:

```js
colors: {
  primary: '#1e3a5f',
  'primary-light': '#f0f4f8',
  surface: '#ffffff',
  bg: '#f8fafc',
  border: '#e8edf2',
  'border-subtle': '#f1f5f9',
  'text-strong': '#1e293b',
  'text-base': '#475569',
  'text-muted': '#94a3b8',
  'text-faint': '#cbd5e1',
  danger: '#dc2626',
  'danger-bg': '#fee2e2',
  success: '#16a34a',
  warning: '#d97706',
}
```

---

## Escopo da Implementação

### Arquivos a modificar

1. `tailwind.config.js` — novo design token set
2. `src/styles/globals.css` — fonte Geist + reset de base classes
3. `src/components/layout/Layout.tsx` — nova estrutura sidebar + main
4. `src/components/layout/Navigation.tsx` — sidebar com ícones SVG e seções
5. `src/components/layout/Header.tsx` — remover (substituído pelo sidebar logo)
6. `src/components/common/Button.tsx` — novos estilos primary/ghost
7. `src/components/common/Card.tsx` — bordas e sombra refinados
8. `src/components/common/Badge.tsx` — paleta de status
9. `src/components/common/Loading.tsx` — spinner consistente
10. `src/pages/Login.tsx` — layout da página de login

### Arquivos de páginas (ajuste menor de espaçamento)

Todas as páginas herdam o novo layout automaticamente via `Layout.tsx`. Ajustes pontuais de padding/margin onde necessário após o layout base estar pronto.

---

## Critérios de Sucesso

- Sem emojis como ícones na navegação
- Sem `blue-600`, `purple`, `gray-50` como cores dominantes
- Fonte Geist carregando em todas as páginas
- Sidebar funcional com todos os itens de nav atuais
- Badges de alerta preservados e funcionais
- TypeScript sem erros (`npx tsc --noEmit`)
