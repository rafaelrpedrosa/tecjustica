export interface Cliente {
  id: string
  nome: string
  cpfCnpj?: string
  whatsapp?: string
  email?: string
  notas?: string
  createdAt: string
  updatedAt: string
}

export interface CadastroClienteInput {
  nome: string
  cpfCnpj?: string
  whatsapp?: string
  email?: string
  notas?: string
}
