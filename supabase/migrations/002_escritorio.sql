-- Migration: 002_escritorio.sql
-- Tabelas para cadastro e monitoramento de processos do escritório

-- Tabela: escritorio_processos
create table if not exists escritorio_processos (
  id uuid primary key default uuid_generate_v4(),
  cnj text not null unique,
  cliente_nome text not null,
  cliente_polo text not null check (cliente_polo in ('ATIVO', 'PASSIVO', 'TERCEIRO')),
  responsavel text,
  monitorar boolean default true,
  notas text,
  ultima_verificacao timestamptz,
  ultimo_hash_movimento text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_escritorio_cnj on escritorio_processos(cnj);
create index if not exists idx_escritorio_cliente on escritorio_processos(cliente_nome);
create index if not exists idx_escritorio_polo on escritorio_processos(cliente_polo);

-- Tabela: escritorio_alertas
create table if not exists escritorio_alertas (
  id uuid primary key default uuid_generate_v4(),
  cnj text not null references escritorio_processos(cnj) on delete cascade,
  tipo text not null check (tipo in ('NOVO_MOVIMENTO', 'NOVO_DOCUMENTO')),
  descricao text not null,
  lido boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_alertas_cnj on escritorio_alertas(cnj);
create index if not exists idx_alertas_lido on escritorio_alertas(lido) where lido = false;
create index if not exists idx_alertas_created on escritorio_alertas(created_at desc);

-- RLS
alter table escritorio_processos enable row level security;

create policy "allow_select_escritorio" on escritorio_processos
  for select using (true);

create policy "allow_insert_escritorio" on escritorio_processos
  for insert with check (true);

create policy "allow_update_escritorio" on escritorio_processos
  for update using (true) with check (true);

create policy "allow_delete_escritorio" on escritorio_processos
  for delete using (true);

alter table escritorio_alertas enable row level security;

create policy "allow_select_alertas" on escritorio_alertas
  for select using (true);

create policy "allow_insert_alertas" on escritorio_alertas
  for insert with check (true);

create policy "allow_update_alertas" on escritorio_alertas
  for update using (true) with check (true);

-- Trigger para updated_at em escritorio_processos
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger escritorio_processos_updated_at
  before update on escritorio_processos
  for each row execute function update_updated_at_column();
