alter table public.client_message_events
  add column if not exists actor_user_id uuid null,
  add column if not exists actor_email text null;