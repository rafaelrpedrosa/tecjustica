create table if not exists public.client_message_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.client_message_approvals(id) on delete cascade,
  cnj text not null,
  event_type text not null,
  message_snapshot text null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists client_message_events_approval_idx
  on public.client_message_events (approval_id, created_at desc);

create index if not exists client_message_events_cnj_idx
  on public.client_message_events (cnj, created_at desc);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_message_approvals TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_message_events TO anon, authenticated, service_role;