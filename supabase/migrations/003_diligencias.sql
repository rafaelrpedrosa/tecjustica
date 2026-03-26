-- supabase/migrations/003_diligencias.sql
CREATE TABLE diligencias (
  id               text PRIMARY KEY,
  cnj              text NOT NULL,
  cliente_nome     text,
  tipo_gargalo     text NOT NULL,
  descricao        text NOT NULL,
  prioridade       text NOT NULL CHECK (prioridade IN ('URGENTE','ALTA','NORMAL','MONITORAR')),
  dias_parado      integer NOT NULL,
  acao_recomendada text NOT NULL CHECK (acao_recomendada IN ('LIGACAO_SECRETARIA','LIGACAO_GABINETE','EMAIL_VARA','RECHECK')),
  status           text NOT NULL CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','SEM_RETORNO')),
  responsavel      text,
  data_criacao     text NOT NULL,
  data_prevista    text,
  data_execucao    text,
  retorno          text,
  proxima_acao     text,
  proxima_data     text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_diligencias_cnj    ON diligencias(cnj);
CREATE INDEX idx_diligencias_status ON diligencias(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON diligencias TO anon, authenticated, service_role;
