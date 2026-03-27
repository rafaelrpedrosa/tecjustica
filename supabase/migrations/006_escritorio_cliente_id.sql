-- Migration: 006_escritorio_cliente_id.sql
-- Add cliente_id foreign key to escritorio_processos

alter table escritorio_processos
add column cliente_id uuid references clientes(id) on delete set null;

create index if not exists idx_escritorio_cliente_id on escritorio_processos(cliente_id);
