-- Track the last proactive client notification sent for each monitored process

alter table escritorio_processos
add column if not exists last_client_notification_at timestamptz,
add column if not exists last_client_notification_type text;

create index if not exists idx_escritorio_last_client_notification_at
on escritorio_processos(last_client_notification_at);
