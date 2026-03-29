alter table if exists escritorio_processos
  add column if not exists fase_processual text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'escritorio_processos_fase_processual_check'
  ) then
    alter table escritorio_processos
      add constraint escritorio_processos_fase_processual_check
      check (
        fase_processual is null or fase_processual in (
          'CONHECIMENTO',
          'SENTENCIADO',
          'LIQUIDACAO_EXECUCAO',
          'AGUARDANDO_RPV',
          'ARQUIVADO'
        )
      );
  end if;
end $$;

create index if not exists idx_escritorio_processos_fase_processual
  on escritorio_processos (fase_processual);

