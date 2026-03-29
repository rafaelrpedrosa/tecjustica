-- 005_settings.sql: Tabela de configurações da aplicação (tokens de LLM)

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  encrypted boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para busca rápida por chave
CREATE UNIQUE INDEX IF NOT EXISTS settings_key_idx ON settings(key);

-- Permissões: backend (service_role) e authenticated podem ler/escrever
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO authenticated;

-- Revogar permissões de anon (tokens são privados)
REVOKE ALL ON settings FROM anon;

-- Politica RLS: usuários autenticados podem ler/escrever suas próprias configurações
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read settings" ON settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update settings" ON settings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert settings" ON settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete settings" ON settings
  FOR DELETE USING (auth.role() = 'authenticated');
