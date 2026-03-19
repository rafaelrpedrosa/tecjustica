-- Migration: Initialize Supabase Cache Tables
-- Purpose: Create persistent cache layer for TecJustica MCP queries with TTL tracking

-- 1. PROCESSES (Visão geral + resumo)
create table if not exists processes (
  id uuid primary key default uuid_generate_v4(),
  cnj text unique not null,
  tribunal text,
  classe text,
  assunto text,
  status text,
  valor numeric,
  data_abertura date,
  juiz text,
  json_resumo jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint valid_cnj check (cnj ~ '^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$')
);
create index if not exists idx_processes_cnj on processes(cnj);

-- 2. PARTES (DADOS COMPLETOS - nome, CPF/CNPJ, emails, endereços)
create table if not exists process_parties (
  id uuid primary key default uuid_generate_v4(),
  process_id uuid references processes(id) on delete cascade,
  tipo text,
  nome text not null,
  cpf_cnpj text,
  cpf_cnpj_formatado text,
  email text,
  telefone text,
  endereco text,
  complemento_endereco text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_parties_process on process_parties(process_id);

-- 3. ADVOGADOS (Dados completos)
create table if not exists process_lawyers (
  id uuid primary key default uuid_generate_v4(),
  party_id uuid references process_parties(id) on delete cascade,
  nome text not null,
  oab text,
  email text,
  telefone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_lawyers_party on process_lawyers(party_id);

-- 4. MOVIMENTOS (Permanentes - histórico completo, nunca deletar)
create table if not exists process_movements (
  id uuid primary key default uuid_generate_v4(),
  process_id uuid references processes(id) on delete cascade,
  data timestamptz not null,
  descricao text not null,
  orgao text,
  tipo text,
  hash_unico text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_movements_process on process_movements(process_id);
create index if not exists idx_movements_data on process_movements(data desc);

-- 5. DOCUMENTOS (Metadados + conteúdo extraído completo)
create table if not exists process_documents (
  id uuid primary key default uuid_generate_v4(),
  process_id uuid references processes(id) on delete cascade,
  doc_id_externo text,
  titulo text not null,
  tipo text,
  data_criacao timestamptz,
  paginas int,
  url_pdf text,
  texto_extraido text,
  tamanho_bytes int,
  hash_unico text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_documents_process on process_documents(process_id);

-- 6. PRECEDENTES (Cache de buscas)
create table if not exists precedents_cache (
  id uuid primary key default uuid_generate_v4(),
  termo_busca text not null,
  query_hash text unique,
  resultados_json jsonb,
  total_results int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_precedents_hash on precedents_cache(query_hash);

-- 7. RASTREAMENTO DE CACHE (Saber quando chamar MCP novamente)
create table if not exists cache_metadata (
  id uuid primary key default uuid_generate_v4(),
  tipo_dado text not null,
  chave_id text not null,
  last_fetch_from_mcp timestamptz,
  ttl_segundos int,
  proxima_atualizacao_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_cache_key unique(tipo_dado, chave_id)
);
create index if not exists idx_cache_meta_key on cache_metadata(tipo_dado, chave_id);

-- 8. AUDITORIA (Log permanente de acessos - nunca deletar)
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  acao text not null,
  tipo_dado text,
  referencia_id text,
  user_ip text,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_created on audit_logs(created_at desc);

-- RLS Policies
alter table processes enable row level security;
alter table process_parties enable row level security;
alter table process_lawyers enable row level security;
alter table process_movements enable row level security;
alter table process_documents enable row level security;
alter table precedents_cache enable row level security;
alter table cache_metadata enable row level security;
alter table audit_logs enable row level security;

-- Permite leitura pública
create policy if not exists "processes_select" on processes for select using (true);
create policy if not exists "parties_select" on process_parties for select using (true);
create policy if not exists "lawyers_select" on process_lawyers for select using (true);
create policy if not exists "movements_select" on process_movements for select using (true);
create policy if not exists "documents_select" on process_documents for select using (true);
create policy if not exists "precedents_select" on precedents_cache for select using (true);
create policy if not exists "cache_meta_select" on cache_metadata for select using (true);
create policy if not exists "audit_logs_select" on audit_logs for select using (true);

-- Audit logs: sem delete (imutável)
create policy if not exists "audit_logs_no_delete" on audit_logs for delete using (false);
