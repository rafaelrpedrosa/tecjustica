create table if not exists public.client_message_approvals (
  id uuid primary key default gen_random_uuid(),
  cnj text not null,
  cliente_id uuid null references public.clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_whatsapp text null,
  source_type text not null,
  source_reference text not null,
  titulo text null,
  draft_message text not null,
  status text not null default 'PENDING',
  payload_json jsonb not null default '{}'::jsonb,
  approved_at timestamptz null,
  sent_at timestamptz null,
  rejected_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists client_message_approvals_source_uidx
  on public.client_message_approvals (cnj, source_type, source_reference);

create index if not exists client_message_approvals_cnj_status_idx
  on public.client_message_approvals (cnj, status, created_at desc);
