/**
 * Backend API Server para RPAtec
 * Usa cliente MCP oficial do SDK para comunicação com MCP server
 * Expõe REST endpoints amigáveis para o frontend
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Configuração MCP
const MCP_SERVER_URL = process.env.PROXY_TARGET_URL || 'https://tecjusticamcp-lite-production.up.railway.app/mcp';
const AUTH_TOKEN = process.env.TECJUSTICA_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ TECJUSTICA_AUTH_TOKEN não configurado. Defina a variável de ambiente antes de iniciar.');
  process.exit(1);
}

// Cliente MCP global
let mcpClient = null;
let clientConnected = false;

/**
 * Inicializar cliente MCP
 */
async function initializeMCPClient() {
  if (clientConnected && mcpClient) {
    return mcpClient;
  }

  try {
    console.log(`🔌 Conectando ao MCP Server: ${MCP_SERVER_URL}`);
    console.log(`   AUTH Token length: ${AUTH_TOKEN?.length}`);

    // Usar transporte Streamable HTTP (protocolo MCP moderno)
    const transport = new StreamableHTTPClientTransport(
      new URL(MCP_SERVER_URL),
      {
        requestInit: {
          headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
        },
      }
    );

    // Criar cliente MCP
    const clientOptions = {
      name: 'tecjustica-backend',
      version: '1.0.0',
    };

    mcpClient = new Client(clientOptions);

    // Conectar cliente ao transporte
    await mcpClient.connect(transport);

    clientConnected = true;
    console.log(`✅ MCP Client conectado com sucesso`);

    // Listar tools disponíveis
    try {
      const tools = await mcpClient.request({ method: 'tools/list' }, null);
      console.log(`🔧 Tools disponíveis (${tools.tools?.length || 0})`);
      tools.tools?.forEach((tool) => {
        console.log(`   - ${tool.name}`);
      });
    } catch (e) {
      console.warn(`⚠️ Não foi possível listar tools:`, e.message);
    }

    return mcpClient;
  } catch (error) {
    console.error(`❌ Erro ao inicializar MCP Client:`, error.message);
    clientConnected = false;
    throw error;
  }
}

/**
 * Executar ferramenta MCP (com retry automático ao expirar sessão)
 */
async function callMCPTool(toolName, toolInput) {
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!mcpClient || !clientConnected) {
        await initializeMCPClient();
      }

      console.log(`🔧 Chamando MCP Tool: ${toolName}`, JSON.stringify(toolInput).substring(0, 100));

      const result = await mcpClient.callTool({
        name: toolName,
        arguments: toolInput,
      });

      console.log(`✅ MCP Result recebido`);
      return result;
    } catch (error) {
      console.error(`❌ Tentativa ${attempt}/${MAX_RETRIES} falhou para ${toolName}:`, error.message);
      mcpClient = null;
      clientConnected = false;
      if (attempt === MAX_RETRIES) throw error;
      console.log(`🔄 Sessão expirada, reconectando...`);
    }
  }
}

/**
 * Extrai texto do resultado MCP (content[0].text)
 */
function extractMCPText(result) {
  if (!result) return null;
  if (result.content && Array.isArray(result.content)) {
    const textContent = result.content.find(c => c.type === 'text');
    if (textContent) return textContent.text;
  }
  if (result.structuredContent?.result) return result.structuredContent.result;
  if (typeof result === 'string') return result;
  return null;
}

/**
 * Parse visão geral: texto MCP → objeto estruturado
 */
function parseVisaoGeral(text, numero_processo) {
  const get = (key) => {
    const m = text.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`));
    return m ? m[1].trim() : '';
  };
  const tribunalFull = get('Tribunal');
  const tribunal = tribunalFull.split('|')[0].trim();
  const statusFull = get('Status');
  const status = statusFull.split('|')[0].trim();
  const valorMatch = text.match(/Valor:\s*R\$\s*([\d.,]+)/);
  // Formato MCP usa vírgula como milhar: "66,568.58" → 66568.58
  const valor = valorMatch ? parseFloat(valorMatch[1].replace(/,/g, '')) : 0;
  const dataMatch = text.match(/Ajuizado:\s*(\d{4}-\d{2}-\d{2})/);
  return {
    numero_processo: get('Processo') || numero_processo,
    tribunal,
    classe: get('Classe'),
    assunto: get('Assunto'),
    status: status || 'Em andamento',
    valor,
    data_abertura: dataMatch ? dataMatch[1] : null,
    resumo: text,
  };
}

/**
 * Parse movimentos: texto MCP → array
 * Formato: [N] YYYY-MM-DD HH:MM | Tipo\n     Descricao\n     Doc: uuid
 */
function parseMovimentos(text) {
  const movements = [];
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const headerMatch = line.match(/^\[(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+\|\s+(.+)$/);
    if (headerMatch) {
      if (current) movements.push(current);
      current = {
        id: `mov-${headerMatch[1]}`,
        data: `${headerMatch[2]}T${headerMatch[3]}:00`,
        tipo: headerMatch[4].trim(),
        descricao: '',
        orgao: '',
        doc_id: null,
      };
    } else if (current && line.trim().startsWith('Doc:')) {
      current.doc_id = line.trim().replace('Doc:', '').trim();
    } else if (current && line.trim() && !line.trim().startsWith('Mostrando')) {
      if (!current.descricao) current.descricao = line.trim();
    }
  }
  if (current) movements.push(current);
  return movements;
}

/**
 * Parse documentos: texto MCP → array
 * Formato: [N] YYYY-MM-DD | filename (Tipo) | N pag | N chars | ACESSO\n     ID: uuid
 */
function parseDocumentos(text) {
  const docs = [];
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const headerMatch = line.match(/^\[(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(.+?)\s+\((.+?)\)/);
    if (headerMatch) {
      if (current) docs.push(current);
      const pagsMatch = line.match(/(\d+)\s+pag/);
      current = {
        id: null,
        titulo: headerMatch[3].trim(),
        tipo: headerMatch[4].trim(),
        data_criacao: headerMatch[2],
        paginas: pagsMatch ? parseInt(pagsMatch[1]) : null,
      };
    } else if (current && line.trim().startsWith('ID:')) {
      const idMatch = line.match(/ID:\s*([\w-]+)/);
      if (idMatch) current.id = idMatch[1];
    }
  }
  if (current) docs.push(current);
  return docs;
}

/**
 * Parse partes: texto MCP → { POLO_ATIVO, POLO_PASSIVO }
 * Formato:
 *   POLO ATIVO:\n  NOME\n  Tipo: X | Pessoa Y\n  CPF/CNPJ: ...\n  Adv: NOME (OAB/XX N)
 */
function parsePartes(text) {
  const result = { POLO_ATIVO: [], POLO_PASSIVO: [], POLO_OUTROS: [] };
  let currentPolo = null;
  let currentParty = null;

  const flushParty = () => {
    if (currentParty && currentPolo) {
      result[currentPolo].push(currentParty);
      currentParty = null;
    }
  };

  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;

    if (l.startsWith('POLO ATIVO') || l.startsWith('POLO_ATIVO')) {
      flushParty(); currentPolo = 'POLO_ATIVO';
    } else if (l.startsWith('POLO PASSIVO') || l.startsWith('POLO_PASSIVO')) {
      flushParty(); currentPolo = 'POLO_PASSIVO';
    } else if (l.startsWith('POLO OUTROS') || l.startsWith('OUTROS') || l.startsWith('TERCEIRO')) {
      flushParty(); currentPolo = 'POLO_OUTROS';
    } else if (currentPolo && l.startsWith('Tipo:')) {
      if (currentParty) currentParty.tipo = l.replace('Tipo:', '').split('|')[0].trim();
    } else if (currentPolo && (l.startsWith('CPF:') || l.startsWith('CNPJ:') || l.startsWith('CPF/CNPJ:'))) {
      if (currentParty) currentParty.cpf_cnpj = l.split(':').slice(1).join(':').trim();
    } else if (currentPolo && l.startsWith('Adv:')) {
      const advMatch = l.match(/Adv:\s+(.+?)\s+\(OAB\/(\w+)\s+(\w+)\)/);
      if (currentParty && advMatch) {
        currentParty.advogados = currentParty.advogados || [];
        currentParty.advogados.push({ nome: advMatch[1], oab: `${advMatch[2]} ${advMatch[3]}` });
      }
    } else if (currentPolo && !l.startsWith('-') && l.length > 2 && !l.includes(':')) {
      flushParty();
      currentParty = { nome: l, tipo: 'PARTE', cpf_cnpj: '', email: '', advogados: [] };
    }
  }
  flushParty();
  return result;
}

/**
 * Parse precedentes: texto MCP → { busca, total, resultados }
 */
function parsePrecedentes(text, busca) {
  const resultados = [];
  const totalMatch = text.match(/Total:\s*([\d.]+)\s*precedente/);
  const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g, '')) : 0;

  const TIPO_MAP = {
    'Sumula Vinculante': 'SV', 'Súmula Vinculante': 'SV',
    'Sumula': 'SUM', 'Súmula': 'SUM',
    'Repercussao Geral': 'RG', 'Repercussão Geral': 'RG',
    'IRDR': 'IRDR', 'IRR': 'IRR',
    'Recurso Repetitivo': 'RR', 'Recursos Repetitivos': 'RR',
  };

  // Parse cada item: "N. [ORGAO] Ementa \u2014 Status (atualiz: ...)\n   Tese: ..."
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    // Usa \u2014 (em-dash) e permite status com parênteses
    const headerMatch = line.match(/^(\d+)\.\s+\[([^\]]+)\]\s+(.+?)\s+[\u2014\-]+\s+(.+)$/);
    if (headerMatch) {
      if (current) resultados.push(current);
      const ementaFull = headerMatch[3].trim();
      const statusRaw = headerMatch[4].trim();
      // Status: "Vigente (atualiz: 01/04/2025)" → "Vigente"
      const status = statusRaw.split('(')[0].trim();
      let tipo = 'CT';
      for (const [name, code] of Object.entries(TIPO_MAP)) {
        if (ementaFull.includes(name)) { tipo = code; break; }
      }
      current = {
        id: `prec-${headerMatch[2]}-${headerMatch[1]}`,
        ementa: ementaFull,
        tese: '',
        tribunal: headerMatch[2],
        orgao: headerMatch[2],
        tipo,
        status,
        href: null,
      };
    } else if (current && line.trim().startsWith('Tese:')) {
      current.tese = line.trim().replace('Tese:', '').trim();
    }
  }
  if (current) resultados.push(current);

  return { busca, total, resultados };
}

/**
 * Parse busca processos: texto MCP → array de processos
 */
function parseBuscaProcessos(text) {
  const processos = [];
  // Formato: "1. CNJ (TRIBUNAL)\n   Classe: ...\n   STATUS | Ajuiz: ..."
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const headerMatch = line.match(/^\d+\.\s+(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\s+\(([^)]+)\)/);
    if (headerMatch) {
      if (current) processos.push(current);
      current = { numero_processo: headerMatch[1], tribunal: headerMatch[2], classe: '', status: '' };
    } else if (current && line.trim().startsWith('Classe:')) {
      current.classe = line.trim().replace('Classe:', '').trim();
    } else if (current && line.includes('|') && line.includes('Ajuiz:')) {
      current.status = line.trim().split('|')[0].trim();
    }
  }
  if (current) processos.push(current);
  return processos;
}

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/process/visao-geral - Buscar visão geral de processo
 * Body: { numero_processo: string }
 */
app.post('/api/process/visao-geral', async (req, res) => {
  try {
    const { numero_processo } = req.body;

    if (!numero_processo) {
      return res.status(400).json({ error: 'numero_processo é obrigatório' });
    }

    // Validar formato CNJ
    const cnjRegex = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
    if (!cnjRegex.test(numero_processo)) {
      return res
        .status(400)
        .json({ error: 'Formato CNJ inválido: NNNNNNN-DD.AAAA.J.TR.OOOO' });
    }

    // Se VITE_USE_MOCK está ativo, retornar mock data
    if (process.env.VITE_USE_MOCK === 'true') {
      console.log(`📋 Retornando mock data para ${numero_processo}`);
      return res.json({
        numero_processo: numero_processo,
        tribunal: 'TJCE',
        classe: 'Procedimento Comum Cível',
        assunto: 'Responsabilidade Civil',
        status: 'Em andamento',
        valor_causa: 50000.00,
        data_ajuizamento: '2025-01-15',
        juiz: 'Dr. João Silva',
        natureza: 'Cível',
        fase: 'Conhecimento',
        _mock: true,
        _updated_at: new Date().toISOString()
      });
    }

    // Chamar MCP Tool e converter resposta texto → JSON estruturado
    try {
      const result = await callMCPTool('pdpj_visao_geral_processo', { numero_processo });
      const text = extractMCPText(result);
      if (!text) return res.status(404).json({ error: 'Processo não encontrado' });
      res.json(parseVisaoGeral(text, numero_processo));
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.status(503).json({ error: 'Serviço MCP temporariamente indisponível' });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/search - Buscar processos por CPF/CNPJ
 * Body: { cpf_cnpj: string, tribunal?: string, situacao?: string }
 */
app.post('/api/process/search', async (req, res) => {
  try {
    const { cpf_cnpj, tribunal, situacao } = req.body;

    if (!cpf_cnpj) {
      return res.status(400).json({ error: 'cpf_cnpj é obrigatório' });
    }

    const digitsOnly = cpf_cnpj.replace(/\D/g, '');
    if (digitsOnly.length !== 11 && digitsOnly.length !== 14) {
      return res.status(400).json({ error: 'CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos' });
    }

    const result = await callMCPTool('pdpj_buscar_processos', {
      cpf_cnpj,
      tribunal: tribunal || null,
      situacao: situacao || null,
    });
    const text = extractMCPText(result);
    const processos = text ? parseBuscaProcessos(text) : [];
    res.json({ processos, _raw: text?.substring(0, 200) });
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/partes - Listar partes de um processo
 * Body: { numero_processo: string }
 */
app.post('/api/process/partes', async (req, res) => {
  try {
    const { numero_processo } = req.body;

    if (!numero_processo) {
      return res.status(400).json({ error: 'numero_processo é obrigatório' });
    }

    try {
      const result = await callMCPTool('pdpj_list_partes', { numero_processo });
      const text = extractMCPText(result);
      res.json(text ? parsePartes(text) : { POLO_ATIVO: [], POLO_PASSIVO: [] });
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.json({ POLO_ATIVO: [], POLO_PASSIVO: [] });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/movimentos - Listar movimentos de um processo
 * Body: { numero_processo: string, limit?: number, offset?: number }
 */
app.post('/api/process/movimentos', async (req, res) => {
  try {
    const { numero_processo, limit = 20, offset = 0 } = req.body;

    if (!numero_processo) {
      return res.status(400).json({ error: 'numero_processo é obrigatório' });
    }

    try {
      const result = await callMCPTool('pdpj_list_movimentos', { numero_processo, limit, offset });
      const text = extractMCPText(result);
      res.json(text ? parseMovimentos(text) : []);
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.json([]);
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/documentos - Listar documentos de um processo
 * Body: { numero_processo: string, limit?: number, offset?: number }
 */
app.post('/api/process/documentos', async (req, res) => {
  try {
    const { numero_processo, limit = 20, offset = 0 } = req.body;

    if (!numero_processo) {
      return res.status(400).json({ error: 'numero_processo é obrigatório' });
    }

    try {
      const result = await callMCPTool('pdpj_list_documentos', { numero_processo, limit, offset });
      const text = extractMCPText(result);
      res.json(text ? parseDocumentos(text) : []);
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.json([]);
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/documento/conteudo - Ler conteúdo de um documento
 * Body: { numero_processo: string, documento_id: string }
 */
app.post('/api/process/documento/conteudo', async (req, res) => {
  try {
    const { numero_processo, documento_id } = req.body;

    if (!numero_processo || !documento_id) {
      return res
        .status(400)
        .json({ error: 'numero_processo e documento_id são obrigatórios' });
    }

    try {
      const result = await callMCPTool('pdpj_read_documento', {
        numero_processo,
        documento_id,
      });
      res.json(result);
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.status(404).json({ error: 'Documento não encontrado ou indisponível no momento' });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/documento/url - Obter URL do documento
 * Body: { numero_processo: string, documento_id: string }
 */
app.post('/api/process/documento/url', async (req, res) => {
  try {
    const { numero_processo, documento_id } = req.body;

    if (!numero_processo || !documento_id) {
      return res
        .status(400)
        .json({ error: 'numero_processo e documento_id são obrigatórios' });
    }

    try {
      const result = await callMCPTool('pdpj_get_documento_url', {
        numero_processo,
        documento_id,
      });
      res.json(result);
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.status(404).json({ error: 'URL do documento não encontrada ou indisponível no momento' });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/precedentes/buscar - Buscar precedentes
 * Body: { busca: string, orgaos?: string[], tipos?: string[] }
 */
app.post('/api/precedentes/buscar', async (req, res) => {
  try {
    const { busca, orgaos, tipos } = req.body;

    if (!busca) {
      return res.status(400).json({ error: 'busca é obrigatória' });
    }

    try {
      const result = await callMCPTool('pdpj_buscar_precedentes', {
        busca,
        orgaos: orgaos || null,
        tipos: tipos || null,
      });
      const text = extractMCPText(result);
      res.json(text ? parsePrecedentes(text, busca) : { busca, total: 0, resultados: [] });
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.json({ busca, total: 0, resultados: [] });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend API Server rodando em http://localhost:${PORT}`);
  console.log(`📡 MCP Server: ${MCP_SERVER_URL}`);
  console.log(`📡 Usando Streamable HTTP transport para comunicação MCP`);
});
