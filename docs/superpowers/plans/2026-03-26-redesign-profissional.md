# Redesign Profissional JusFlow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o visual genérico atual por um design system profissional: sidebar lateral fixa, fundo off-white, cor primária navy, fonte Geist — sem cara de IA, sem emojis como ícones.

**Architecture:** Substituição progressiva bottom-up — primeiro os tokens de design (Tailwind + CSS), depois a estrutura de layout (Layout + Navigation), depois os componentes comuns, por último a página de Login. Cada tarefa é independente e verificável visualmente rodando `npm run dev`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v3, Vite, Geist (Google Fonts CDN)

**Verificação visual:** Após cada tarefa, abrir `http://localhost:5173` e confirmar que o sistema está funcional e sem erros no console.

---

## Mapa de Arquivos

| Arquivo | Ação | O que muda |
|---|---|---|
| `tailwind.config.js` | Modificar | Tokens de cor: navy, off-white, borders |
| `src/styles/globals.css` | Modificar | Import Geist + reset de classes base |
| `src/components/layout/Layout.tsx` | Modificar | Sidebar fixa + área de conteúdo principal |
| `src/components/layout/Navigation.tsx` | Modificar | Nav vertical com SVG icons e seções |
| `src/components/layout/Header.tsx` | Modificar | Simplificar — logo move para sidebar |
| `src/components/common/Button.tsx` | Modificar | Variantes navy, ghost, danger refinadas |
| `src/components/common/Card.tsx` | Modificar | Border sutil, sem shadow genérico |
| `src/components/common/Badge.tsx` | Modificar | Variantes com paleta sóbria |
| `src/pages/Login.tsx` | Modificar | Cores navy, fundo off-white, inputs refinados |

---

## Task 1: Design Tokens — Tailwind + Geist

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Substituir tailwind.config.js**

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Atualizar globals.css com import da Geist e classes base**

```css
/* src/styles/globals.css */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    scroll-behavior: smooth;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  body {
    background-color: #f8fafc;
    color: #1e293b;
  }
}

@layer components {
  .btn {
    @apply px-3 py-1.5 rounded-md font-medium text-sm transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply btn bg-primary text-white hover:bg-[#162d4a];
  }

  .btn-ghost {
    @apply btn bg-surface text-text-base border border-border hover:bg-bg;
  }

  .card {
    @apply bg-surface rounded-lg border border-border;
  }

  .input-base {
    @apply w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text-strong placeholder:text-text-faint focus:outline-none focus:border-primary transition-colors;
  }
}
```

- [ ] **Step 3: Verificar que o servidor compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/styles/globals.css
git commit -m "design: add Geist font and professional color token system"
```

---

## Task 2: Layout — Sidebar Fixa + Área Principal

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Simplificar Header.tsx — apenas exporta null (logo vai para sidebar)**

```tsx
// src/components/layout/Header.tsx
// Logo agora está na sidebar — este componente não é mais usado no Layout
// Mantido para não quebrar imports existentes
const Header: React.FC = () => null
export default Header
```

- [ ] **Step 2: Substituir Layout.tsx pela nova estrutura sidebar + main**

```tsx
// src/components/layout/Layout.tsx
import React from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from './Navigation'

const Layout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-bg">
      <Navigation />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
```

- [ ] **Step 3: Verificar que o app abre sem erros no console**

Abrir `http://localhost:5173` — deve aparecer o conteúdo mesmo sem a sidebar estilizada ainda (Navigation.tsx será atualizado na Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Layout.tsx src/components/layout/Header.tsx
git commit -m "design: replace header+topnav layout with sidebar structure"
```

---

## Task 3: Navigation — Sidebar com Ícones SVG e Seções

**Files:**
- Modify: `src/components/layout/Navigation.tsx`

- [ ] **Step 1: Substituir Navigation.tsx pela sidebar vertical**

```tsx
// src/components/layout/Navigation.tsx
import React, { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiClient } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

// Ícones SVG inline — 15x15px
const Icons = {
  search: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4"/><path d="m10.5 10.5 2.5 2.5"/>
    </svg>
  ),
  person: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="5" r="3"/><path d="M2 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
  ),
  document: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1.5" width="10" height="12" rx="1"/><path d="M5 5h5M5 7.5h5M5 10h3"/>
    </svg>
  ),
  folder: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3l1.5 1.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-6z"/>
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="5.5"/><path d="M7.5 4.5v3l2 2"/>
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="5.5" cy="5" r="2.5"/><path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
      <circle cx="11" cy="4.5" r="2"/><path d="M13.5 12c0-2-1.5-3.5-3.5-3.5"/>
    </svg>
  ),
  chart: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 11.5 5 7.5l3 2.5 5.5-6.5"/>
    </svg>
  ),
  bars: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="9" width="2.5" height="4" rx="0.5"/><rect x="6.25" y="6" width="2.5" height="7" rx="0.5"/><rect x="10.5" y="3" width="2.5" height="10" rx="0.5"/>
    </svg>
  ),
  ai: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="5.5"/><circle cx="7.5" cy="7.5" r="2"/>
      <path d="M7.5 2v1M7.5 12v1M2 7.5h1M12 7.5h1"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1.5v1.2M7.5 12.3v1.2M1.5 7.5h1.2M12.3 7.5h1.2M3.2 3.2l.85.85M10.95 10.95l.85.85M10.95 3.2l-.85.85M3.2 10.95l.85-.85"/>
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10.5l3-3-3-3M13 7.5H6"/>
    </svg>
  ),
}

const Navigation: React.FC = () => {
  const location = useLocation()
  const [alertasCount, setAlertasCount] = useState(0)
  const [urgentesCount, setUrgentesCount] = useState(0)
  const { user, signOut } = useAuth()

  useEffect(() => {
    if (!user) return
    const loadStatus = () => {
      apiClient
        .get('/api/escritorio/status')
        .then(res => {
          setAlertasCount(res.data.alertasCount)
          setUrgentesCount(res.data.urgentesCount)
        })
        .catch(e => console.warn('Falha ao carregar status:', e))
    }
    loadStatus()
    const interval = setInterval(loadStatus, 60_000)
    return () => clearInterval(interval)
  }, [user])

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname])

  const navItem = (to: string, icon: React.ReactNode, label: string, badge?: number) => (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        isActive(to)
          ? 'bg-primary-light text-primary font-medium'
          : 'text-text-muted hover:bg-bg hover:text-text-base'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-danger-bg text-danger px-1.5 py-0.5 rounded-full leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )

  const sectionLabel = (label: string) => (
    <span className="block px-2.5 pt-4 pb-1 text-[10px] font-semibold tracking-widest uppercase text-text-faint">
      {label}
    </span>
  )

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'US'

  return (
    <aside className="w-[220px] shrink-0 bg-surface border-r border-border flex flex-col min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">J</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-strong leading-tight">JusFlow</div>
          <div className="text-[10px] text-text-faint leading-tight">Sistema Jurídico</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {sectionLabel('Consulta')}
        {navItem('/', Icons.search, 'Buscar Processo')}
        {navItem('/search-cpf', Icons.person, 'Buscar por CPF')}
        {navItem('/precedents', Icons.document, 'Precedentes')}

        {sectionLabel('Gestão')}
        {navItem('/meus-processos', Icons.folder, 'Meus Processos', alertasCount)}
        {navItem('/diligencias', Icons.clock, 'Diligências', urgentesCount)}
        {navItem('/clientes', Icons.users, 'Clientes')}

        {sectionLabel('Analytics')}
        {navItem('/dashboard-operacional', Icons.chart, 'Dashboard')}
        {navItem('/dashboard-tempos', Icons.bars, 'Tempos')}
        {navItem('/ia', Icons.ai, 'Assistente IA')}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-subtle px-2 py-2">
        {navItem('/configuracoes', Icons.settings, 'Configurações')}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1">
          <div className="w-6 h-6 rounded-full bg-primary-light flex items-center justify-center shrink-0">
            <span className="text-[9px] font-semibold text-primary">{userInitials}</span>
          </div>
          <span className="flex-1 text-[11px] text-text-muted truncate">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-text-faint hover:text-danger transition-colors"
            title="Sair"
          >
            {Icons.logout}
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Navigation
```

- [ ] **Step 2: Verificar visualmente a sidebar**

Abrir `http://localhost:5173` — confirmar:
- Sidebar branca à esquerda com logo "J" navy
- Itens de nav com ícones SVG (sem emojis)
- Item ativo com fundo `#f0f4f8` e texto navy
- Footer com email e botão de logout

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Navigation.tsx
git commit -m "design: replace emoji nav with professional sidebar and SVG icons"
```

---

## Task 4: Button — Variantes Refinadas

**Files:**
- Modify: `src/components/common/Button.tsx`

- [ ] **Step 1: Substituir Button.tsx**

```tsx
// src/components/common/Button.tsx
import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-[#162d4a]',
  secondary: 'bg-primary-light text-primary hover:bg-[#e4ecf5]',
  ghost: 'bg-surface text-text-base border border-border hover:bg-bg',
  danger: 'bg-danger text-white hover:bg-red-700',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-md font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
      {...props}
    />
  )
)

Button.displayName = 'Button'

export default Button
```

- [ ] **Step 2: Verificar que botões existentes ainda renderizam**

Abrir `http://localhost:5173` — botão "Buscar Processo" na Home deve aparecer em navy, sem azul brilhante.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/Button.tsx
git commit -m "design: refine button variants with navy primary and subtle ghost"
```

---

## Task 5: Card — Bordas Sutis sem Shadow Genérico

**Files:**
- Modify: `src/components/common/Card.tsx`

- [ ] **Step 1: Substituir Card.tsx**

```tsx
// src/components/common/Card.tsx
import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-surface rounded-lg border border-border ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  )
)

Card.displayName = 'Card'

export default Card

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`px-5 py-3.5 border-b border-border-subtle ${className || ''}`}>
    {children}
  </div>
)

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`px-5 py-4 ${className || ''}`}>{children}</div>

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`px-5 py-3.5 border-t border-border-subtle bg-bg ${className || ''}`}>
    {children}
  </div>
)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/Card.tsx
git commit -m "design: refine card borders and padding, remove generic shadow"
```

---

## Task 6: Badge — Paleta Sóbria

**Files:**
- Modify: `src/components/common/Badge.tsx`

- [ ] **Step 1: Substituir Badge.tsx**

```tsx
// src/components/common/Badge.tsx
import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  children: React.ReactNode
}

const badgeVariants: Record<string, string> = {
  default: 'bg-border text-text-base',
  success: 'bg-green-50 text-success',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-primary-light text-primary',
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeVariants[variant]} ${className || ''}`}
      {...props}
    >
      {children}
    </span>
  )
)

Badge.displayName = 'Badge'

export default Badge
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/Badge.tsx
git commit -m "design: refine badge variants with subtle professional palette"
```

---

## Task 7: Login — Página Refinada

**Files:**
- Modify: `src/pages/Login.tsx`

- [ ] **Step 1: Substituir Login.tsx**

```tsx
// src/pages/Login.tsx
import React, { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const Login: React.FC = () => {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white text-base font-bold">J</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-text-strong leading-tight">JusFlow</div>
            <div className="text-xs text-text-faint leading-tight">Sistema Jurídico</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-text-strong mb-5">Entrar na sua conta</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-base mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-base mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="input-base"
              />
            </div>

            {error && (
              <p className="text-xs text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-primary hover:bg-[#162d4a] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
```

- [ ] **Step 2: Verificar página de login**

Abrir `http://localhost:5173/login` — confirmar fundo off-white, card branco, botão navy, sem azul brilhante.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "design: update login page with professional navy palette and Geist font"
```

---

## Task 8: Verificação Final

- [ ] **Step 1: TypeScript completo**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 2: Checklist visual — percorrer cada rota**

Abrir cada rota e confirmar que nenhuma tem:
- [ ] Fundo azul-brilhante (`bg-blue-600` / `#2563eb`) como cor dominante
- [ ] Emojis na navegação (👤📊⏱🤖⚙️)
- [ ] `bg-gray-50` como único fundo
- [ ] Fonte diferente de Geist (verificar no DevTools > Computed > font-family)
- [ ] Sidebar aparecendo em todas as rotas protegidas

Rotas a verificar: `/`, `/meus-processos`, `/diligencias`, `/clientes`, `/dashboard-operacional`, `/dashboard-tempos`, `/ia`, `/configuracoes`, `/login`

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "design: complete professional redesign - sidebar, Geist, navy palette"
```
