-- 009_financeiro_asaas.sql
-- Mapeamento de clientes/cobrancas com gateway financeiro (Asaas)

CREATE TABLE IF NOT EXISTS financeiro_clientes_gateway (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  gateway text NOT NULL DEFAULT 'asaas',
  gateway_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_clientes_gateway_unique UNIQUE (cliente_id, gateway)
);

CREATE INDEX IF NOT EXISTS financeiro_clientes_gateway_cliente_idx
  ON financeiro_clientes_gateway(cliente_id);

CREATE INDEX IF NOT EXISTS financeiro_clientes_gateway_customer_idx
  ON financeiro_clientes_gateway(gateway, gateway_customer_id);

CREATE TABLE IF NOT EXISTS financeiro_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  processo_cnj text,
  gateway text NOT NULL DEFAULT 'asaas',
  gateway_charge_id text NOT NULL,
  gateway_customer_id text,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  billing_type text NOT NULL,
  status text NOT NULL,
  due_date date NOT NULL,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_copy_paste text,
  external_reference text,
  last_payload_json jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_cobrancas_unique UNIQUE (gateway, gateway_charge_id)
);

CREATE INDEX IF NOT EXISTS financeiro_cobrancas_cliente_idx
  ON financeiro_cobrancas(cliente_id);

CREATE INDEX IF NOT EXISTS financeiro_cobrancas_processo_idx
  ON financeiro_cobrancas(processo_cnj);

CREATE INDEX IF NOT EXISTS financeiro_cobrancas_status_idx
  ON financeiro_cobrancas(status);

CREATE INDEX IF NOT EXISTS financeiro_cobrancas_due_date_idx
  ON financeiro_cobrancas(due_date DESC);

CREATE TABLE IF NOT EXISTS financeiro_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'asaas',
  event_type text NOT NULL,
  gateway_object_id text,
  payload_json jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financeiro_eventos_gateway_idx
  ON financeiro_eventos(gateway, event_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro_clientes_gateway TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro_cobrancas TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro_eventos TO service_role, authenticated;

ALTER TABLE financeiro_clientes_gateway ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read financeiro_clientes_gateway" ON financeiro_clientes_gateway
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can write financeiro_clientes_gateway" ON financeiro_clientes_gateway
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can read financeiro_cobrancas" ON financeiro_cobrancas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can write financeiro_cobrancas" ON financeiro_cobrancas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can read financeiro_eventos" ON financeiro_eventos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can write financeiro_eventos" ON financeiro_eventos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
