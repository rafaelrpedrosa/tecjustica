-- Adiciona 'ARQUIVADO' à check constraint de fase_processual
alter table escritorio_processos
  drop constraint if exists escritorio_processos_fase_processual_check;

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
