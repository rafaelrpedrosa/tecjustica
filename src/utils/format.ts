/**
 * Utilitários de formatação para exibição de dados jurídicos
 */

/**
 * Formata data para o padrão brasileiro DD/MM/AAAA
 */
export function formatDateBR(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

/**
 * Formata valor monetário em reais
 */
export function formatCurrencyBR(value: number | null | undefined): string {
  if (value == null) return '—'
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

/**
 * Formata CPF: 000.000.000-00
 */
export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/**
 * Formata CNPJ: 00.000.000/0000-00
 */
export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

/**
 * Formata CPF ou CNPJ automaticamente com base no tamanho
 */
export function formatCPFCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return formatCPF(digits)
  if (digits.length === 14) return formatCNPJ(digits)
  return value
}
