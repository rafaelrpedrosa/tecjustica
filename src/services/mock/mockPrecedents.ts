/**
 * Dados mock de precedentes
 */

import { Precedent } from '@/types/precedent'

export const mockPrecedents: Precedent[] = [
  {
    id: '1',
    titulo: 'Súmula nº 1 - Imunidade Tributária de Pessoa Jurídica de Direito Público',
    ementa:
      'A imunidade tributária não alcança a pessoa jurídica de direito privado, ainda que instituída pelo Poder Público ou vinculada a ele',
    tese: 'A imunidade tributária prevista no artigo 150, VI, da Constituição Federal aplica-se apenas às pessoas jurídicas de direito público',
    tribunal: 'STF',
    tipo: 'SUM',
    status: 'Ativa',
    data: '2010-05-15',
  },
  {
    id: '2',
    titulo: 'Súmula nº 373 - INSS e Contribuição Sindical',
    ementa:
      'A contribuição sindical não é dedutível da base de cálculo das contribuições para o INSS',
    tese: 'Contribuição sindical não reduz base de cálculo do INSS',
    tribunal: 'STF',
    tipo: 'SUM',
    status: 'Ativa',
    data: '1999-12-10',
  },
  {
    id: '3',
    titulo: 'Repercussão Geral - Nº 1141 - Rescisão de Contrato Trabalhista',
    ementa:
      'Tem repercussão geral a questão acerca da condenação ao pagamento de verbas rescisórias em contrato de trabalho rescindido',
    tese: 'A condenação ao pagamento de verbas rescisórias constitui questão com repercussão geral',
    tribunal: 'STF',
    tipo: 'RG',
    status: 'Ativa',
    data: '2015-08-20',
  },
  {
    id: '4',
    titulo: 'Orientação Jurisprudencial nº 247 - Dano Moral - Reincidência',
    ementa:
      'Reconhece-se o direito do empregado de receber indenização por dano moral quando reiteradas as violações de seus direitos fundamentais',
    tese: 'Violações reiteradas de direitos fundamentais justificam indenização por dano moral',
    tribunal: 'STJ',
    tipo: 'OJ',
    status: 'Ativa',
    data: '2008-03-12',
  },
  {
    id: '5',
    titulo: 'Incidente de Resolução de Demandas Repetitivas nº 2025-0001',
    ementa:
      'Trata da interpretação uniforme das regras de cálculo de FGTS em demissões por justa causa',
    tese: 'FGTS é debido mesmo em caso de dispensa por justa causa em circunstâncias específicas',
    tribunal: 'TST',
    tipo: 'IRDR',
    status: 'Ativa',
    data: '2024-01-30',
  },
  {
    id: '6',
    titulo: 'Tema de Jurisprudência Repetitiva nº 456 - Indenização por Dano Moral',
    ementa:
      'Estabelece parâmetros para quantificação de indenização por dano moral em causas trabalhistas',
    tese: 'O dano moral deve ser quantificado em bases razoáveis e proporcionais ao dano causado',
    tribunal: 'TST',
    tipo: 'CT',
    status: 'Ativa',
    data: '2022-06-15',
  },
]
