-- Criar extension UUID se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROCESSOS (Visão geral + resumo)
CREATE TABLE processes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cnj text UNIQUE NOT NULL,
  tribunal text,
  classe text,
  assunto text,
  status text,
  valor numeric,
  data_abertura date,
  juiz text,
  json_resumo jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_cnj CHECK (cnj ~ '^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$')
);
CREATE INDEX idx_processes_cnj ON processes(cnj);

-- 2. PARTES (Dados completos - nome, CPF/CNPJ, emails, endereços)
CREATE TABLE process_parties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id uuid REFERENCES processes(id) ON DELETE CASCADE,
  tipo text,
  nome text NOT NULL,
  cpf_cnpj text,
  cpf_cnpj_formatado text,
  email text,
  telefone text,
  endereco text,
  complemento_endereco text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_parties_process ON process_parties(process_id);

-- 3. ADVOGADOS (Dados completos)
CREATE TABLE process_lawyers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id uuid REFERENCES process_parties(id) ON DELETE CASCADE,
  nome text NOT NULL,
  oab text,
  email text,
  telefone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lawyers_party ON process_lawyers(party_id);

-- 4. MOVIMENTOS (Permanentes - histórico completo, nunca deletar)
CREATE TABLE process_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id uuid REFERENCES processes(id) ON DELETE CASCADE,
  data timestamptz NOT NULL,
  descricao text NOT NULL,
  orgao text,
  tipo text,
  hash_unico text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_movements_process ON process_movements(process_id);
CREATE INDEX idx_movements_data ON process_movements(data DESC);

-- 5. DOCUMENTOS (Metadados + conteúdo extraído completo)
CREATE TABLE process_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id uuid REFERENCES processes(id) ON DELETE CASCADE,
  doc_id_externo text,
  titulo text NOT NULL,
  tipo text,
  data_criacao timestamptz,
  paginas int,
  url_pdf text,
  texto_extraido text,
  tamanho_bytes int,
  hash_unico text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_documents_process ON process_documents(process_id);

-- 6. PRECEDENTES (Cache de buscas)
CREATE TABLE precedents_cache (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  termo_busca text NOT NULL,
  query_hash text UNIQUE,
  resultados_json jsonb,
  total_results int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_precedents_hash ON precedents_cache(query_hash);

-- 7. RASTREAMENTO DE CACHE (Saber quando chamar MCP novamente)
CREATE TABLE cache_metadata (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_dado text NOT NULL,
  chave_id text NOT NULL,
  last_fetch_from_mcp timestamptz,
  ttl_segundos int,
  proxima_atualizacao_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_cache_key UNIQUE(tipo_dado, chave_id)
);
CREATE INDEX idx_cache_meta_key ON cache_metadata(tipo_dado, chave_id);

-- 8. AUDITORIA (Log permanente de acessos - nunca deletar)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  acao text NOT NULL,
  tipo_dado text,
  referencia_id text,
  user_ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Política para impedir deleção em audit_logs
CREATE POLICY "audit_logs_no_delete" ON audit_logs
  FOR DELETE USING (false);

-- Habilitar RLS nas tabelas
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE precedents_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Política padrão: permitir leitura para todos (MVP sem autenticação)
CREATE POLICY "allow_read_all" ON processes FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON process_parties FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON process_lawyers FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON process_movements FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON process_documents FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON precedents_cache FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON cache_metadata FOR SELECT USING (true);
CREATE POLICY "allow_read_all" ON audit_logs FOR SELECT USING (true);

-- Políticas de escrita (para o servidor/proxy)
CREATE POLICY "allow_insert_all" ON processes FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON process_parties FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON process_lawyers FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON process_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON process_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON precedents_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON cache_metadata FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_insert_all" ON audit_logs FOR INSERT WITH CHECK (true);

-- Upsert nas tabelas de metadata
CREATE POLICY "allow_update_cache" ON cache_metadata FOR UPDATE WITH CHECK (true);
CREATE POLICY "allow_update_precedents" ON precedents_cache FOR UPDATE WITH CHECK (true);
