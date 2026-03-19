/**
 * Dados mock de documentos
 */

import { Document } from '@/types/document'

export const mockDocuments: Document[] = [
  {
    id: '1',
    processId: '1',
    docIdExterno: 'doc001',
    titulo: 'Petição Inicial',
    tipo: 'Petição',
    dataCriacao: '2023-06-10T14:20:00Z',
    paginas: 12,
    urlPdf: 'https://exemplo.com/peticio-inicial.pdf',
    tamanhoBytes: 456789,
    createdAt: '2023-06-10T14:20:00Z',
    updatedAt: '2023-06-10T14:20:00Z',
  },
  {
    id: '2',
    processId: '1',
    docIdExterno: 'doc002',
    titulo: 'Contestação',
    tipo: 'Contestação',
    dataCriacao: '2023-07-05T11:00:00Z',
    paginas: 8,
    urlPdf: 'https://exemplo.com/contestacao.pdf',
    tamanhoBytes: 323456,
    createdAt: '2023-07-05T11:00:00Z',
    updatedAt: '2023-07-05T11:00:00Z',
  },
  {
    id: '3',
    processId: '1',
    docIdExterno: 'doc003',
    titulo: 'Sentença',
    tipo: 'Sentença',
    dataCriacao: '2024-03-10T09:00:00Z',
    paginas: 5,
    urlPdf: 'https://exemplo.com/sentenca.pdf',
    tamanhoBytes: 234567,
    createdAt: '2024-03-10T09:00:00Z',
    updatedAt: '2024-03-10T09:00:00Z',
  },
]
