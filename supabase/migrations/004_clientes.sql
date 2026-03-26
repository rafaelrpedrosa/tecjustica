-- 004_clientes.sql: Tabela de clientes do escritório

CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  whatsapp text,
  email text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice único para CPF/CNPJ (somente quando preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_cnpj_idx
  ON clientes (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL;

-- Vincular processos do escritório a clientes (nullable — não quebra dados existentes)
ALTER TABLE escritorio_processos
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL;

-- Permissões (obrigatório para Supabase migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON clientes TO anon, authenticated, service_role;
