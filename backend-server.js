/**
 * Backend API Server para RPAtec
 * Usa cliente MCP oficial do SDK para comunicação com MCP server
 * Expõe REST endpoints amigáveis para o frontend
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Nível 1 — Geral: todas as rotas /api/*
 * 120 req / minuto por IP (2 req/s) — uso normal de uma aplicação
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento e tente novamente.' },
  skip: (req) => req.path === '/api/health',
});

/**
 * Nível 2 — MCP intensivo: buscas e leitura de documentos
 * 20 req / minuto por IP — cada chamada consome crédito no MCP externo
 */
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de consultas atingido (20/min). Aguarde antes de realizar nova busca.' },
});

/**
 * Nível 3 — PDF proxy: evita download abusivo
 * 10 req / minuto por IP
 */
const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de downloads atingido (10/min). Aguarde antes de abrir mais documentos.' },
});

// ─────────────────────────────────────────────────────────────────────────────

// Middleware
app.set('trust proxy', 1); // Confiar no primeiro proxy (nginx, Railway, etc.) para IP real no rate limiter
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.VITE_SUPABASE_URL || ''].filter(Boolean),
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // permite PDFs inline
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());
app.use('/api', generalLimiter);

// ─── Autenticação de origem ───────────────────────────────────────────────────
const API_SECRET = process.env.API_SECRET;
if (API_SECRET) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next(); // health check público
    const key = req.headers['x-api-key'];
    if (key !== API_SECRET) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    next();
  });
} else {
  console.warn('⚠️  API_SECRET não definido. Em produção, defina API_SECRET=<chave> para proteger o backend.');
}
// ─────────────────────────────────────────────────────────────────────────────

// Configuração MCP
const MCP_SERVER_URL = process.env.PROXY_TARGET_URL || 'https://tecjusticamcp-lite-production.up.railway.app/mcp';
const AUTH_TOKEN = process.env.TECJUSTICA_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ TECJUSTICA_AUTH_TOKEN não configurado. Defina a variável de ambiente antes de iniciar.');
  process.exit(1);
}

// ─── Supabase — auditoria ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role — nunca expor no frontend

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

if (!supabase) {
  console.warn('⚠️  Supabase não configurado — auditoria desativada (defina VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY)');
} else {
  console.log('📋 Supabase conectado — auditoria ativa');
}

/**
 * Registra um acesso no audit_log de forma assíncrona (fire-and-forget).
 * Nunca bloqueia a resposta — falhas são apenas logadas.
 *
 * @param {import('express').Request} req  - request Express (para IP e user-agent)
 * @param {string} acao        - Ex: 'SEARCH_CNJ', 'SEARCH_CPF', 'VIEW_DOCUMENT'
 * @param {string} tipoDado    - Ex: 'process', 'document', 'precedent'
 * @param {string} referenciaId - CNJ, CPF, doc_id, termo de busca
 */
function audit(req, acao, tipoDado, referenciaId) {
  if (!supabase) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.socket?.remoteAddress
           || req.ip
           || 'unknown';

  const userAgent = (req.headers['user-agent'] || '').substring(0, 200);

  // Fire-and-forget: não bloqueia a resposta
  supabase.from('audit_logs').insert({
    acao,
    tipo_dado: tipoDado,
    referencia_id: String(referenciaId).substring(0, 200),
    user_ip: ip,
    user_agent: userAgent,
  }).then(({ error }) => {
    if (error) console.warn(`[audit] Falha ao registrar ${acao}:`, error.message);
  }).catch((err) => {
    console.warn(`[audit] Exceção ao registrar ${acao}:`, err.message);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

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
    console.log(`   AUTH Token: ${AUTH_TOKEN ? 'presente ✓' : '⚠️ AUSENTE'}`);

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

// ─── Configurações de resiliência ────────────────────────────────────────────
const MCP_TIMEOUT_MS  = 20_000;   // 20s por chamada
const MAX_RETRIES     = 3;        // tentativas totais
const BACKOFF_BASE_MS = 500;      // 500ms → 1000ms → 2000ms

/**
 * Executa uma Promise com timeout.
 * Lança erro se não resolver dentro de `ms` milissegundos.
 */
/**
 * Envolve uma Promise com timeout.
 * @param {Promise<any>} promise - Promise a aguardar
 * @param {number} ms - Limite em milissegundos
 * @param {string} label - Nome da operação para mensagem de erro
 * @returns {Promise<any>} Resultado da promise ou rejeição por timeout
 */
function withTimeout(promise, ms, label = 'operação') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout após ${ms}ms em "${label}"`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Espera ms milissegundos (usado no backoff).
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executar ferramenta MCP com:
 *  - timeout por chamada (20s)
 *  - retry exponencial (até 3 tentativas)
 *  - reconexão automática ao expirar sessão
 */
async function callMCPTool(toolName, toolInput) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1); // 500, 1000, 2000

    try {
      // Garante cliente conectado
      if (!mcpClient || !clientConnected) {
        await withTimeout(initializeMCPClient(), MCP_TIMEOUT_MS, 'connect');
      }

      console.log(`🔧 [${attempt}/${MAX_RETRIES}] ${toolName}`, JSON.stringify(toolInput).substring(0, 100));
      const start = Date.now();

      const result = await withTimeout(
        mcpClient.callTool({ name: toolName, arguments: toolInput }),
        MCP_TIMEOUT_MS,
        toolName
      );

      console.log(`✅ ${toolName} concluído em ${Date.now() - start}ms`);
      return result;

    } catch (error) {
      lastError = error;
      const isTimeout  = error.message?.includes('Timeout');
      const isSession  = error.message?.includes('session') || error.message?.includes('connect');
      const label      = isTimeout ? '⏱ TIMEOUT' : isSession ? '🔌 SESSÃO' : '❌ ERRO';

      console.error(`${label} tentativa ${attempt}/${MAX_RETRIES} — ${toolName}: ${error.message}`);

      // Descarta cliente para forçar reconexão
      mcpClient = null;
      clientConnected = false;

      if (attempt < MAX_RETRIES) {
        console.log(`🔄 Aguardando ${backoff}ms antes de tentar novamente...`);
        await sleep(backoff);
      }
    }
  }

  // Esgotou tentativas
  console.error(`💀 ${toolName} falhou após ${MAX_RETRIES} tentativas. Último erro: ${lastError?.message}`);
  throw lastError;
}

// ─── Validação de inputs ──────────────────────────────────────────────────────

const CNJ_RE = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

/**
 * Valida número CNJ no formato NNNNNNN-DD.AAAA.J.TT.OOOO.
 * @param {string} cnj - Número CNJ bruto
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateCNJ(cnj) {
  if (!cnj || typeof cnj !== 'string') return { ok: false, error: 'CNJ ausente' };
  const clean = cnj.trim();
  if (clean.length < 7 || clean.length > 50) return { ok: false, error: 'CNJ com comprimento inválido' };
  if (!CNJ_RE.test(clean)) return { ok: false, error: `CNJ inválido — formato esperado: NNNNNNN-DD.AAAA.J.TT.OOOO` };
  return { ok: true, value: clean };
}

/**
 * Valida CPF pelo algoritmo de dígitos verificadores.
 * @param {string} digits - 11 dígitos numéricos sem formatação
 * @returns {boolean}
 */
function validateCPF(digits) {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // todos iguais
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 === 10 || d1 === 11) d1 = 0;
  if (d1 !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 === 10 || d2 === 11) d2 = 0;
  return d2 === parseInt(digits[10]);
}

/**
 * Valida CNPJ pelo algoritmo de dígitos verificadores.
 * @param {string} digits - 14 dígitos numéricos sem formatação
 * @returns {boolean}
 */
function validateCNPJ(digits) {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const calc = (d, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += parseInt(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  return calc(digits, w1) === parseInt(digits[12]) && calc(digits, w2) === parseInt(digits[13]);
}

/**
 * Valida CPF (11 dígitos) ou CNPJ (14 dígitos), removendo máscara automaticamente.
 * @param {string} raw - CPF ou CNPJ com ou sem formatação
 * @returns {{ ok: true, value: string, tipo: 'CPF'|'CNPJ' } | { ok: false, error: string }}
 */
function validateCPFCNPJ(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'CPF/CNPJ ausente' };
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    if (!validateCPF(digits)) return { ok: false, error: 'CPF inválido (dígito verificador incorreto)' };
    return { ok: true, value: digits, tipo: 'CPF' };
  }
  if (digits.length === 14) {
    if (!validateCNPJ(digits)) return { ok: false, error: 'CNPJ inválido (dígito verificador incorreto)' };
    return { ok: true, value: digits, tipo: 'CNPJ' };
  }
  return { ok: false, error: `CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos — recebido: ${digits.length}` };
}

/**
 * Valida string de busca livre (termos de pesquisa de precedentes etc.).
 * @param {string} raw - Texto da busca
 * @param {number} minLen - Tamanho mínimo aceito (default 3)
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateBusca(raw, minLen = 3) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'Busca ausente' };
  const clean = raw.trim();
  if (clean.length < minLen) return { ok: false, error: `Busca muito curta (mínimo ${minLen} caracteres)` };
  if (clean.length > 500) return { ok: false, error: 'Busca muito longa (máximo 500 caracteres)' };
  return { ok: true, value: clean };
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Parser MCP padronizado ───────────────────────────────────────────────────

/**
 * Extrai TODOS os conteúdos possíveis de uma resposta MCP.
 * Retorna { text, structured, allTexts, format, isError }
 *
 * Formatos conhecidos do MCP:
 *  A) { content: [{type:'text', text:'...'}, ...] }          ← mais comum
 *  B) { content: [{type:'text', text:'...'}, {type:'image'}] }
 *  C) { structuredContent: { result: '...' } }               ← alternativo
 *  D) string direta
 *  E) { isError: true, content: [...] }                      ← erro do MCP
 */
function parseMCPResponse(result, toolName = 'unknown') {
  if (!result) {
    console.warn(`[MCP:${toolName}] Resposta nula`);
    return { text: null, structured: null, allTexts: [], format: 'null', isError: true };
  }

  // Formato D: string direta
  if (typeof result === 'string') {
    return { text: result, structured: null, allTexts: [result], format: 'string', isError: false };
  }

  const isError = result.isError === true;

  // Formato A/B/E: content array
  if (result.content && Array.isArray(result.content)) {
    const allTexts = result.content
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text.trim())
      .filter(Boolean);

    const text = allTexts.join('\n\n') || null;

    if (isError) {
      console.warn(`[MCP:${toolName}] Ferramenta retornou isError=true: ${text?.substring(0, 120)}`);
    }

    return { text, structured: null, allTexts, format: 'content-array', isError };
  }

  // Formato C: structuredContent
  if (result.structuredContent) {
    const structured = result.structuredContent;
    const text = typeof structured.result === 'string'
      ? structured.result
      : JSON.stringify(structured);
    return { text, structured, allTexts: [text], format: 'structured', isError };
  }

  // Desconhecido — serializa para debug
  const fallback = JSON.stringify(result).substring(0, 300);
  console.warn(`[MCP:${toolName}] Formato desconhecido — keys: ${Object.keys(result).join(', ')}`);
  return { text: null, structured: result, allTexts: [], format: 'unknown', isError: true };
}

/**
 * Compatibilidade retroativa: extrai apenas o texto (usado em lugares que
 * ainda não foram migrados para parseMCPResponse).
 * @deprecated Use parseMCPResponse() diretamente.
 */
function extractMCPText(result) {
  return parseMCPResponse(result, '?').text;
}

// ─── Helpers de parser ────────────────────────────────────────────────────────

/**
 * Detecta se o texto indica erro ou ausência de dados.
 */
function isMCPError(text) {
  if (!text) return true;
  return /NAO encontrado|não encontrado|^Erro|retornou HTTP [45]/i.test(text);
}

/**
 * Extrai campo chave:valor de texto MCP de forma robusta.
 * Tenta variações: "Chave:", "chave:", espaços extras, encoding.
 */
function extractField(text, ...keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(`${escaped}\\s*:\\s*(.+?)(?:\\n|$)`, 'i'));
    if (m) return m[1].trim();
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse visão geral: texto MCP → objeto estruturado
 * Suporta variações de labels (Processo/Número, Ajuizado/Data, etc.)
 */
function parseVisaoGeral(text, numero_processo) {
  const tribunalFull = extractField(text, 'Tribunal', 'tribunal');
  const parts        = tribunalFull.split('|').map(s => s.trim());
  const tribunal     = parts[0];
  // Vara: 3ª parte do campo Tribunal (ex: "TRF5 | 1o Grau | JEF - PERNAMBUCO")
  const vara         = parts.length >= 3 ? parts[2] : '';
  const statusFull   = extractField(text, 'Status', 'status', 'Situação', 'Situacao');
  const status       = statusFull.split('|')[0].trim();

  // Valor: detecta formato US (1,234.56) ou BR (1.234,56) pelo último separador
  const valorMatch = text.match(/Valor\s*(?:da\s+Causa)?\s*:\s*R?\$?\s*([\d.,]+)/i);
  let valor = 0;
  if (valorMatch) {
    const raw = valorMatch[1];
    const lastDot   = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');
    let normalized;
    if (lastDot > lastComma) {
      // Formato US: ponto é decimal → remove vírgulas
      normalized = raw.replace(/,/g, '');
    } else {
      // Formato BR: vírgula é decimal → remove pontos, vírgula → ponto
      normalized = raw.replace(/\./g, '').replace(',', '.');
    }
    valor = parseFloat(normalized) || 0;
  }

  // Data: aceita YYYY-MM-DD e DD/MM/YYYY
  const dataMatch = text.match(/Ajuizado\s*:\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
  let data_abertura = null;
  if (dataMatch) {
    const raw = dataMatch[1];
    if (raw.includes('/')) {
      const [d, m, y] = raw.split('/');
      data_abertura = `${y}-${m}-${d}`;
    } else {
      data_abertura = raw;
    }
  }

  return {
    numero_processo: extractField(text, 'Processo', 'Número', 'Numero') || numero_processo,
    tribunal,
    classe:         extractField(text, 'Classe', 'classe'),
    assunto:        extractField(text, 'Assunto', 'assunto', 'Matéria'),
    status:         status || 'Em andamento',
    juiz:           extractField(text, 'Juiz', 'juiz', 'Magistrado'),
    vara,
    valor,
    data_abertura,
    resumo:         text,
  };
}

/**
 * Parse movimentos: texto MCP → array
 * Suporta formatos:
 *  A) [N] YYYY-MM-DD HH:MM | Tipo\n   Desc\n   Doc: uuid
 *  B) N. YYYY-MM-DD - Tipo\n   Desc
 *  C) Data: YYYY-MM-DD\nTipo: ...\nDesc: ...
 */
function parseMovimentos(text) {
  const movements = [];
  const lines = text.split('\n');
  let current = null;
  let idx = 0;

  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith('Mostrando') || l.startsWith('Total:')) continue;

    // Formato A: [N] YYYY-MM-DD HH:MM | Tipo
    const fmtA = l.match(/^\[(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+\|\s+(.+)$/);
    // Formato B: N. YYYY-MM-DD - Tipo  ou  N. YYYY-MM-DD | Tipo
    const fmtB = !fmtA && l.match(/^(\d+)\.\s+(\d{4}-\d{2}-\d{2})\s+[-|]\s+(.+)$/);
    // Formato C: "Data: YYYY-MM-DD"
    const fmtC = !fmtA && !fmtB && l.match(/^Data\s*:\s*(\d{4}-\d{2}-\d{2})/i);

    if (fmtA) {
      if (current) movements.push(current);
      current = { id: `mov-${fmtA[1]}`, data: `${fmtA[2]}T${fmtA[3]}:00`, tipo: fmtA[4].trim(), descricao: '', orgao: '', doc_id: null };
    } else if (fmtB) {
      if (current) movements.push(current);
      current = { id: `mov-${fmtB[1]}`, data: `${fmtB[2]}T00:00:00`, tipo: fmtB[3].trim(), descricao: '', orgao: '', doc_id: null };
    } else if (fmtC) {
      if (current) movements.push(current);
      idx++;
      current = { id: `mov-${idx}`, data: `${fmtC[1]}T00:00:00`, tipo: '', descricao: '', orgao: '', doc_id: null };
    } else if (current) {
      if (l.startsWith('Doc:'))   { current.doc_id = l.replace(/^Doc:\s*/i, '').trim(); }
      else if (l.startsWith('Tipo:') && !current.tipo) { current.tipo = l.replace(/^Tipo:\s*/i, '').trim(); }
      else if (l.startsWith('Órgão:') || l.startsWith('Orgao:')) { current.orgao = l.split(':').slice(1).join(':').trim(); }
      else if (!current.descricao && l.length > 2) { current.descricao = l; }
    }
  }
  if (current) movements.push(current);

  if (movements.length === 0) console.warn('[parseMovimentos] Nenhum movimento extraído — verificar formato do texto MCP');
  return movements;
}

/**
 * Parse documentos: texto MCP → array
 * Suporta formatos:
 *  A) [N] YYYY-MM-DD | titulo (Tipo) | N pag | N chars | ACESSO\n   ID: uuid
 *  B) N. titulo\n   Data: YYYY-MM-DD\n   ID: uuid\n   Tipo: ...
 */
function parseDocumentos(text) {
  const docs = [];
  const lines = text.split('\n');
  let current = null;

  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith('Mostrando') || l.startsWith('Total:')) continue;

    // Formato A: [N] YYYY-MM-DD | titulo (Tipo)
    const fmtA = l.match(/^\[(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(.+?)\s+\(([^)]+)\)/);
    // Formato B: N. titulo (sem data na linha)
    const fmtB = !fmtA && l.match(/^(\d+)\.\s+(.+)$/);

    if (fmtA) {
      if (current) docs.push(current);
      const pagsMatch = l.match(/(\d+)\s+p[áa]g/i);
      current = {
        id: null,
        titulo: fmtA[3].trim(),
        tipo: fmtA[4].trim(),
        data_criacao: fmtA[2],
        paginas: pagsMatch ? parseInt(pagsMatch[1]) : null,
      };
    } else if (fmtB && !l.includes(':')) {
      if (current) docs.push(current);
      current = { id: null, titulo: fmtB[2].trim(), tipo: '', data_criacao: null, paginas: null };
    } else if (current) {
      if (l.startsWith('ID:'))    { const m = l.match(/ID:\s*([\w-]+)/); if (m) current.id = m[1]; }
      if (l.startsWith('Data:'))  { const m = l.match(/(\d{4}-\d{2}-\d{2})/); if (m) current.data_criacao = m[1]; }
      if (l.startsWith('Tipo:'))  { current.tipo = l.replace(/^Tipo:\s*/i, '').trim(); }
      if (l.match(/(\d+)\s+p[áa]g/i)) { const m = l.match(/(\d+)\s+p[áa]g/i); if (m) current.paginas = parseInt(m[1]); }
    }
  }
  if (current) docs.push(current);

  if (docs.length === 0) console.warn('[parseDocumentos] Nenhum documento extraído — verificar formato do texto MCP');
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
app.post('/api/process/visao-geral', mcpLimiter, async (req, res) => {
  try {
    const { numero_processo } = req.body;

    const cnj = validateCNJ(numero_processo);
    if (!cnj.ok) return res.status(400).json({ error: cnj.error });

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
      const { text, isError } = parseMCPResponse(result, 'pdpj_visao_geral_processo');
      if (!text || isError || isMCPError(text)) {
        return res.status(404).json({ error: text || 'Processo não encontrado' });
      }
      const parsed = parseVisaoGeral(text, numero_processo);
      audit(req, 'SEARCH_CNJ', 'process', numero_processo);
      res.json(parsed);
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
app.post('/api/process/search', mcpLimiter, async (req, res) => {
  try {
    const { cpf_cnpj, tribunal, situacao } = req.body;

    const doc = validateCPFCNPJ(cpf_cnpj);
    if (!doc.ok) return res.status(400).json({ error: doc.error });

    const result = await callMCPTool('pdpj_buscar_processos', {
      cpf_cnpj: doc.value,
      tribunal: tribunal || null,
      situacao: situacao || null,
    });
    const { text, isError } = parseMCPResponse(result, 'pdpj_buscar_processos');

    if (!text || isError || isMCPError(text)) {
      return res.json({ processos: [], mcpError: text || 'Sem resultados' });
    }

    const processos = parseBuscaProcessos(text);
    res.json({ processos });
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * POST /api/process/partes - Listar partes de um processo
 * Body: { numero_processo: string }
 */
app.post('/api/process/partes', mcpLimiter, async (req, res) => {
  try {
    const { numero_processo } = req.body;

    const cnj = validateCNJ(numero_processo);
    if (!cnj.ok) return res.status(400).json({ error: cnj.error });

    try {
      const result = await callMCPTool('pdpj_list_partes', { numero_processo: cnj.value });
      const { text, isError } = parseMCPResponse(result, 'pdpj_list_partes');
      const partesResult = text && !isError ? parsePartes(text) : { POLO_ATIVO: [], POLO_PASSIVO: [] };
      if (text && !isError) audit(req, 'VIEW_PARTES', 'process', cnj.value);
      res.json(partesResult);
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
app.post('/api/process/movimentos', mcpLimiter, async (req, res) => {
  try {
    const { numero_processo, limit = 20, offset = 0 } = req.body;

    const cnjM = validateCNJ(numero_processo);
    if (!cnjM.ok) return res.status(400).json({ error: cnjM.error });

    try {
      const result = await callMCPTool('pdpj_list_movimentos', { numero_processo: cnjM.value, limit, offset });
      const { text, isError } = parseMCPResponse(result, 'pdpj_list_movimentos');
      const movs = text && !isError ? parseMovimentos(text) : [];
      if (text && !isError) audit(req, 'VIEW_MOVIMENTOS', 'process', cnjM.value);
      res.json(movs);
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
app.post('/api/process/documentos', mcpLimiter, async (req, res) => {
  try {
    const { numero_processo, limit = 20, offset = 0 } = req.body;

    const cnjD = validateCNJ(numero_processo);
    if (!cnjD.ok) return res.status(400).json({ error: cnjD.error });

    try {
      const result = await callMCPTool('pdpj_list_documentos', { numero_processo: cnjD.value, limit, offset });
      const { text, isError } = parseMCPResponse(result, 'pdpj_list_documentos');
      const docsList = text && !isError ? parseDocumentos(text) : [];
      if (text && !isError) audit(req, 'VIEW_DOCUMENTOS', 'process', cnjD.value);
      res.json(docsList);
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
app.post('/api/process/documento/conteudo', mcpLimiter, async (req, res) => {
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
      const { text, isError } = parseMCPResponse(result, 'pdpj_read_documento');
      if (!text || isError || isMCPError(text)) {
        return res.status(404).json({ error: text || 'Documento não encontrado ou sem conteúdo' });
      }
      audit(req, 'READ_DOCUMENTO', 'document', documento_id);
      res.json({ conteudo: text, metadata: { titulo: '', tipo: '', dataCriacao: '', paginas: null } });
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
app.post('/api/process/documento/url', mcpLimiter, async (req, res) => {
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
      const { text, isError } = parseMCPResponse(result, 'pdpj_get_documento_url');
      if (!text || isError) {
        return res.status(404).json({ error: 'URL do documento não encontrada' });
      }
      // Extrai URL do texto — aceita "URL: https://..." ou URL direta
      const urlMatch = text.match(/(?:URL:\s*)?(https?:\/\/\S+)/);
      const url = urlMatch ? urlMatch[1] : null;
      res.json({ url, texto: text });
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
app.post('/api/precedentes/buscar', mcpLimiter, async (req, res) => {
  try {
    const { busca, orgaos, tipos } = req.body;

    const buscaVal = validateBusca(busca);
    if (!buscaVal.ok) return res.status(400).json({ error: buscaVal.error });

    try {
      const result = await callMCPTool('pdpj_buscar_precedentes', {
        busca,
        orgaos: orgaos || null,
        tipos: tipos || null,
      });
      const { text, isError } = parseMCPResponse(result, 'pdpj_buscar_precedentes');
      const precResult = text && !isError ? parsePrecedentes(text, buscaVal.value) : { busca: buscaVal.value, total: 0, resultados: [] };
      if (text && !isError) audit(req, 'SEARCH_PRECEDENTES', 'precedent', buscaVal.value);
      res.json(precResult);
    } catch (mcpError) {
      console.error('❌ MCP Error:', mcpError.message);
      res.json({ busca, total: 0, resultados: [] });
    }
  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

/**
 * GET /api/documento-pdf/:numero_processo/:documento_id
 * Proxy autenticado: busca URL via MCP e retorna o PDF ao browser
 */
app.get('/api/documento-pdf/:numero_processo/:documento_id', pdfLimiter, async (req, res) => {
  try {
    const { numero_processo, documento_id } = req.params;

    // 1. Obtém URL do documento via MCP
    let pdfUrl = null;
    try {
      const result = await callMCPTool('pdpj_get_documento_url', {
        numero_processo,
        documento_id,
      });
      const { text } = parseMCPResponse(result, 'pdpj_get_documento_url[pdf]');
      if (text) {
        const urlMatch = text.match(/(?:URL:\s*)?(https?:\/\/\S+)/);
        pdfUrl = urlMatch ? urlMatch[1] : null;
      }
    } catch (err) {
      console.error('❌ Erro ao obter URL do documento:', err.message);
    }

    if (!pdfUrl) {
      return res.status(404).json({ error: 'URL do documento não encontrada' });
    }

    // 2. Faz fetch do PDF com token — sem seguir redirects
    console.log(`📄 Baixando PDF: ${pdfUrl}`);
    const pdfResponse = await fetch(pdfUrl, {
      redirect: 'manual',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Accept': 'application/pdf,*/*',
      },
    });

    // Detecta redirect para página de login
    if (pdfResponse.status === 301 || pdfResponse.status === 302 || pdfResponse.status === 303) {
      const location = pdfResponse.headers.get('location') || '';
      console.warn(`⚠️ Redirect detectado → ${location} (PDF requer sessão ativa no TecJustica)`);
      return res.status(401).json({
        error: 'PDF requer autenticação no TecJustica',
        mensagem: 'O servidor de documentos exige login ativo. Use o texto extraído disponível no visualizador.',
        url_original: pdfUrl,
      });
    }

    if (!pdfResponse.ok) {
      console.error(`❌ Erro ao baixar PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
      return res.status(pdfResponse.status).json({ error: 'Erro ao baixar documento PDF' });
    }

    // 3. Verifica se realmente é PDF (não HTML de login)
    const contentType = pdfResponse.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.warn('⚠️ Servidor retornou HTML em vez de PDF — sessão expirada ou não autorizado');
      return res.status(401).json({
        error: 'PDF não disponível',
        mensagem: 'O servidor retornou uma página de autenticação. Use o texto extraído no visualizador.',
      });
    }

    // 4. Repassa headers e stream do PDF ao browser
    const contentLength = pdfResponse.headers.get('content-length');
    const contentDisposition = pdfResponse.headers.get('content-disposition');

    res.setHeader('Content-Type', contentType || 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition || `inline; filename="${documento_id}.pdf"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Stream do PDF diretamente ao cliente (máx. 10.000 chunks ~= ~500MB)
    const reader = pdfResponse.body.getReader();
    const MAX_CHUNKS = 10_000;
    let chunks = 0;
    const pump = async () => {
      if (chunks++ >= MAX_CHUNKS) {
        console.error('❌ PDF stream excedeu limite de chunks — abortando');
        reader.cancel().catch(() => {});
        if (!res.headersSent) res.status(500).json({ error: 'PDF muito grande ou stream corrompido' });
        else res.end();
        return;
      }
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();

  } catch (error) {
    console.error('Erro no proxy PDF:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno ao processar PDF' });
    }
  }
});

// ============================================================
// ESCRITÓRIO — Cadastro e Monitoramento de Processos
// ============================================================

/**
 * GET /api/escritorio/processos
 * Lista todos os processos cadastrados no escritório
 */
app.get('/api/escritorio/processos', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const { data: escritorio, error } = await supabase
      .from('escritorio_processos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET escritorio/processos (Supabase):', error.message);
      return res.status(500).json({ error: 'Erro interno ao processar operação.' });
    }

    // Busca dados dos processos e contagem de alertas não lidos
    const cnjs = escritorio.map(e => e.cnj);
    const [processosResult, alertasResult] = await Promise.allSettled([
      supabase.from('processes').select('cnj,tribunal,classe,assunto,status,data_abertura').in('cnj', cnjs),
      supabase.from('escritorio_alertas').select('cnj').eq('lido', false).in('cnj', cnjs),
    ]);

    const processosRes = processosResult.status === 'fulfilled' ? processosResult.value : { data: [] };
    const alertasRes  = alertasResult.status  === 'fulfilled' ? alertasResult.value  : { data: [] };
    if (processosResult.status === 'rejected') console.warn('[escritorio/processos] Falha ao buscar processes:', processosResult.reason?.message);
    if (alertasResult.status  === 'rejected') console.warn('[escritorio/processos] Falha ao buscar alertas:',  alertasResult.reason?.message);

    const processosMap = {};
    (processosRes.data || []).forEach(p => { processosMap[p.cnj] = p; });

    const alertasCount = {};
    (alertasRes.data || []).forEach(a => {
      alertasCount[a.cnj] = (alertasCount[a.cnj] || 0) + 1;
    });

    const result = escritorio.map(e => ({
      id: e.id,
      cnj: e.cnj,
      clienteNome: e.cliente_nome,
      clientePolo: e.cliente_polo,
      responsavel: e.responsavel,
      vara: e.vara,
      monitorar: e.monitorar,
      notas: e.notas,
      ultimaVerificacao: e.ultima_verificacao,
      ultimoHashMovimento: e.ultimo_hash_movimento,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      processo: processosMap[e.cnj] || null,
      alertasNaoLidos: alertasCount[e.cnj] || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error('Erro GET escritorio/processos:', error);
    res.status(500).json({ error: 'Erro ao buscar processos do escritório' });
  }
});

/**
 * POST /api/escritorio/processos
 * Cadastra um processo no escritório e busca dados do MCP
 * Body: { cnj, clienteNome, clientePolo, responsavel?, monitorar?, notas? }
 */
app.post('/api/escritorio/processos', mcpLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const { cnj, clienteNome, clientePolo, responsavel, vara, monitorar = true, notas } = req.body;

    if (!cnj || !clienteNome || !clientePolo) {
      return res.status(400).json({ error: 'cnj, clienteNome e clientePolo são obrigatórios' });
    }

    const cnjValidado = validateCNJ(cnj);
    if (!cnjValidado.ok) return res.status(400).json({ error: cnjValidado.error });

    if (!['ATIVO', 'PASSIVO', 'TERCEIRO'].includes(clientePolo)) {
      return res.status(400).json({ error: 'clientePolo deve ser ATIVO, PASSIVO ou TERCEIRO' });
    }

    // Inserir no escritório
    const { data: cadastro, error: insertError } = await supabase
      .from('escritorio_processos')
      .insert({
        cnj: cnjValidado.value,
        cliente_nome: clienteNome,
        cliente_polo: clientePolo,
        responsavel: responsavel || null,
        vara: vara || null,
        monitorar,
        notas: notas || null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'Processo já cadastrado no escritório' });
      }
      return res.status(500).json({ error: insertError.message });
    }

    // Busca dados do processo via MCP em background (não bloqueia resposta)
    callMCPTool('pdpj_visao_geral_processo', { numero_processo: cnjValidado.value })
      .then(result => {
        const { text, isError } = parseMCPResponse(result, 'pdpj_visao_geral_processo');
        if (text && !isError && !isMCPError(text)) {
          const parsed = parseVisaoGeral(text, cnjValidado.value);
          supabase.from('processes').upsert({
            cnj: cnjValidado.value,
            tribunal: parsed.tribunal,
            classe: parsed.classe,
            assunto: parsed.assunto,
            status: parsed.status,
            json_resumo: parsed,
          }, { onConflict: 'cnj' }).then(() => {
            console.log(`✅ Dados MCP salvos para ${cnjValidado.value}`);
          });
        }
      })
      .catch(err => console.warn('⚠️ MCP background fetch falhou:', err.message));

    audit(req, 'CADASTRO_ESCRITORIO', 'process', cnjValidado.value);

    res.status(201).json({
      id: cadastro.id,
      cnj: cadastro.cnj,
      clienteNome: cadastro.cliente_nome,
      clientePolo: cadastro.cliente_polo,
      responsavel: cadastro.responsavel,
      vara: cadastro.vara,
      monitorar: cadastro.monitorar,
      notas: cadastro.notas,
      createdAt: cadastro.created_at,
    });
  } catch (error) {
    console.error('Erro POST escritorio/processos:', error.message);
    res.status(500).json({ error: 'Erro ao cadastrar processo' });
  }
});

/**
 * PUT /api/escritorio/processos/:cnj
 * Atualiza dados do cadastro
 * Body: { clienteNome?, clientePolo?, responsavel?, monitorar?, notas? }
 */
app.put('/api/escritorio/processos/:cnj', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const cnjRaw = decodeURIComponent(req.params.cnj);
    const cnjV = validateCNJ(cnjRaw);
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error });
    const cnj = cnjV.value;
    const updates = {};
    const { clienteNome, clientePolo, responsavel, vara, monitorar, notas } = req.body;

    if (clienteNome !== undefined) updates.cliente_nome = clienteNome;
    if (clientePolo !== undefined) {
      if (!['ATIVO', 'PASSIVO', 'TERCEIRO'].includes(clientePolo)) {
        return res.status(400).json({ error: 'clientePolo deve ser ATIVO, PASSIVO ou TERCEIRO' });
      }
      updates.cliente_polo = clientePolo;
    }
    if (responsavel !== undefined) updates.responsavel = responsavel;
    if (vara !== undefined) updates.vara = vara;
    if (monitorar !== undefined) updates.monitorar = monitorar;
    if (notas !== undefined) updates.notas = notas;

    const { data, error } = await supabase
      .from('escritorio_processos')
      .update(updates)
      .eq('cnj', cnj)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Erro ao atualizar processo' });
    if (!data) return res.status(404).json({ error: 'Processo não encontrado no escritório' });

    res.json({ success: true, cnj });
  } catch (error) {
    console.error('Erro PUT escritorio/processos:', error.message);
    res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
});

/**
 * DELETE /api/escritorio/processos/:cnj
 * Remove processo do cadastro do escritório
 */
app.delete('/api/escritorio/processos/:cnj', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const cnj = decodeURIComponent(req.params.cnj);
    const cnjV = validateCNJ(cnj);
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error });

    const { error } = await supabase
      .from('escritorio_processos')
      .delete()
      .eq('cnj', cnj);

    if (error) return res.status(500).json({ error: 'Erro ao remover processo' });
    res.json({ success: true, cnj });
  } catch (error) {
    console.error('Erro DELETE escritorio/processos:', error.message);
    res.status(500).json({ error: 'Erro ao remover processo' });
  }
});

/**
 * POST /api/escritorio/monitorar/:cnj
 * Verifica novos movimentos de um processo específico
 */
app.post('/api/escritorio/monitorar/:cnj', mcpLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const cnjRaw = decodeURIComponent(req.params.cnj);
    const cnjV = validateCNJ(cnjRaw);
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error });
    const cnj = cnjV.value;

    // Busca registro do escritório
    const { data: registro, error: regError } = await supabase
      .from('escritorio_processos')
      .select('*')
      .eq('cnj', cnj)
      .single();

    if (regError || !registro) {
      return res.status(404).json({ error: 'Processo não encontrado no cadastro do escritório' });
    }

    // Busca movimentos atuais via MCP
    let movimentos = [];
    try {
      const result = await callMCPTool('pdpj_list_movimentos', { numero_processo: cnj, limit: 5 });
      const { text, isError } = parseMCPResponse(result, 'pdpj_list_movimentos');
      if (text && !isError) {
        movimentos = parseMovimentos(text);
      }
    } catch (err) {
      console.warn('⚠️ Erro ao buscar movimentos:', err.message);
    }

    const alertasCriados = [];

    if (movimentos.length > 0) {
      const hashMaisRecente = movimentos[0].hash_unico ||
        `${movimentos[0].data || ''}-${(movimentos[0].descricao || '').slice(0, 50)}`;

      // Compara com o último hash conhecido
      if (registro.ultimo_hash_movimento !== hashMaisRecente) {
        // Identifica movimentos novos (todos se nunca monitorado antes)
        const movimentosNovos = registro.ultimo_hash_movimento
          ? movimentos.filter(m => {
              const h = m.hash_unico || `${m.data || ''}-${(m.descricao || '').slice(0, 50)}`;
              return h !== registro.ultimo_hash_movimento;
            })
          : movimentos.slice(0, 1); // Primeira vez: só o mais recente

        for (const mov of movimentosNovos.slice(0, 3)) {
          const dataFormatada = mov.data ? new Date(mov.data ?? '').toLocaleDateString('pt-BR') : 'data desconhecida';
          const descricao = `Novo movimento em ${dataFormatada}: ${(mov.descricao || '').slice(0, 200)}`;
          const { data: alerta, error: alertaError } = await supabase
            .from('escritorio_alertas')
            .insert({ cnj, tipo: 'NOVO_MOVIMENTO', descricao, lido: false })
            .select()
            .single();
          if (alertaError) console.warn('⚠️ Erro ao criar alerta:', alertaError.message);
          else if (alerta) alertasCriados.push(alerta);
        }

        // Atualiza último hash e data de verificação
        const { error: updateHashError } = await supabase
          .from('escritorio_processos')
          .update({
            ultimo_hash_movimento: hashMaisRecente,
            ultima_verificacao: new Date().toISOString(),
          })
          .eq('cnj', cnj);
        if (updateHashError) console.warn('⚠️ Erro ao atualizar hash:', updateHashError.message);
      } else {
        // Sem novidades — só atualiza data de verificação
        const { error: updateVerifError } = await supabase
          .from('escritorio_processos')
          .update({ ultima_verificacao: new Date().toISOString() })
          .eq('cnj', cnj);
        if (updateVerifError) console.warn('⚠️ Erro ao atualizar ultima_verificacao:', updateVerifError.message);
      }
    }

    res.json({
      cnj,
      alertasCriados,
      ultimaVerificacao: new Date().toISOString(),
      mensagem: alertasCriados.length > 0
        ? `${alertasCriados.length} novo(s) movimento(s) encontrado(s)`
        : 'Nenhuma atualização desde a última verificação',
    });
  } catch (error) {
    console.error('Erro POST escritorio/monitorar/:cnj:', error.message);
    res.status(500).json({ error: 'Erro ao monitorar processo' });
  }
});

/**
 * POST /api/escritorio/monitorar
 * Verifica todos os processos monitorados
 */
app.post('/api/escritorio/monitorar', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const { data: processos, error } = await supabase
      .from('escritorio_processos')
      .select('cnj')
      .eq('monitorar', true);

    if (error) {
      console.error('Erro POST escritorio/monitorar (Supabase):', error.message);
      return res.status(500).json({ error: 'Erro interno ao processar operação.' });
    }

    // Dispara monitoramento em background para cada processo
    res.json({
      mensagem: `Monitoramento iniciado para ${processos.length} processo(s)`,
      processos: processos.map(p => p.cnj),
    });

    // Processa em background (não bloqueia resposta)
    for (const { cnj } of processos) {
      try {
        const result = await callMCPTool('pdpj_list_movimentos', { numero_processo: cnj, limit: 3 });
        const { text, isError } = parseMCPResponse(result, 'pdpj_list_movimentos');
        if (!text || isError) continue;

        const movimentos = parseMovimentos(text);
        if (movimentos.length === 0) continue;

        const { data: reg } = await supabase
          .from('escritorio_processos').select('ultimo_hash_movimento').eq('cnj', cnj).single();

        if (!reg) continue;
        const hashNovo = movimentos[0].hash_unico ||
          `${movimentos[0].data || ''}-${(movimentos[0].descricao || '').slice(0, 50)}`;

        if (reg.ultimo_hash_movimento !== hashNovo) {
          const descricao = `Novo movimento: ${(movimentos[0].descricao || '').slice(0, 200)}`;
          await supabase.from('escritorio_alertas').insert({ cnj, tipo: 'NOVO_MOVIMENTO', descricao });
          await supabase.from('escritorio_processos')
            .update({ ultimo_hash_movimento: hashNovo, ultima_verificacao: new Date().toISOString() })
            .eq('cnj', cnj);
        } else {
          await supabase.from('escritorio_processos')
            .update({ ultima_verificacao: new Date().toISOString() }).eq('cnj', cnj);
        }
      } catch (err) {
        console.warn(`⚠️ Erro ao monitorar ${cnj}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Erro POST escritorio/monitorar:', error);
    res.status(500).json({ error: 'Erro ao iniciar monitoramento' });
  }
});

/**
 * GET /api/escritorio/alertas
 * Lista alertas não lidos do escritório
 */
app.get('/api/escritorio/alertas', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const { data, error } = await supabase
      .from('escritorio_alertas')
      .select('*, escritorio_processos(cliente_nome, cliente_polo)')
      .eq('lido', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: 'Erro ao buscar alertas' });

    res.json(data || []);
  } catch (error) {
    console.error('Erro GET escritorio/alertas:', error.message);
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
});

/**
 * PUT /api/escritorio/alertas/:id/lido
 * Marca um alerta como lido
 */
app.put('/api/escritorio/alertas/:id/lido', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const { error } = await supabase
      .from('escritorio_alertas')
      .update({ lido: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Erro ao marcar alerta como lido' });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro PUT alertas/lido:', error.message);
    res.status(500).json({ error: 'Erro ao marcar alerta como lido' });
  }
});

/**
 * PUT /api/escritorio/alertas/lidos/cnj/:cnj
 * Marca todos os alertas não lidos de um processo como lidos
 */
app.put('/api/escritorio/alertas/lidos/cnj/:cnj', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });

    const cnj = decodeURIComponent(req.params.cnj);
    const { error } = await supabase
      .from('escritorio_alertas')
      .update({ lido: true })
      .eq('cnj', cnj)
      .eq('lido', false);

    if (error) return res.status(500).json({ error: 'Erro ao marcar alertas como lidos' });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro PUT alertas/lidos/cnj:', error.message);
    res.status(500).json({ error: 'Erro ao marcar alertas como lidos' });
  }
});

// ─── Diligências ──────────────────────────────────────────────────────────────

function diligenciaToCamel(d) {
  return {
    id:              d.id,
    cnj:             d.cnj,
    clienteNome:     d.cliente_nome ?? undefined,
    tipoGargalo:     d.tipo_gargalo,
    descricao:       d.descricao,
    prioridade:      d.prioridade,
    diasParado:      d.dias_parado,
    acaoRecomendada: d.acao_recomendada,
    status:          d.status,
    responsavel:     d.responsavel ?? undefined,
    dataCriacao:     d.data_criacao,
    dataPrevista:    d.data_prevista ?? undefined,
    dataExecucao:    d.data_execucao ?? undefined,
    retorno:         d.retorno ?? undefined,
    proximaAcao:     d.proxima_acao ?? undefined,
    proximaData:     d.proxima_data ?? undefined,
  };
}

function diligenciaToSnake(d) {
  return {
    id:               d.id,
    cnj:              d.cnj,
    cliente_nome:     d.clienteNome ?? null,
    tipo_gargalo:     d.tipoGargalo,
    descricao:        d.descricao,
    prioridade:       d.prioridade,
    dias_parado:      d.diasParado,
    acao_recomendada: d.acaoRecomendada,
    status:           d.status,
    responsavel:      d.responsavel ?? null,
    data_criacao:     d.dataCriacao,
    data_prevista:    d.dataPrevista ?? null,
    data_execucao:    d.dataExecucao ?? null,
    retorno:          d.retorno ?? null,
    proxima_acao:     d.proximaAcao ?? null,
    proxima_data:     d.proximaData ?? null,
  };
}

// GET /api/diligencias
app.get('/api/diligencias', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .select('*')
      .order('data_criacao', { ascending: false });
    if (error) {
      console.error('Erro GET /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao listar diligências.' });
    }
    res.json(data.map(diligenciaToCamel));
  } catch (err) {
    console.error('Erro GET /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao listar diligências.' });
  }
});

// GET /api/diligencias/cnj/:cnj
app.get('/api/diligencias/cnj/:cnj', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const cnj = decodeURIComponent(req.params.cnj);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .select('*')
      .eq('cnj', cnj)
      .order('data_criacao', { ascending: false });
    if (error) {
      console.error('Erro GET /api/diligencias/cnj:', error.message);
      return res.status(500).json({ error: 'Erro interno ao listar diligências por CNJ.' });
    }
    res.json(data.map(diligenciaToCamel));
  } catch (err) {
    console.error('Erro GET /api/diligencias/cnj:', err.message);
    res.status(500).json({ error: 'Erro interno ao listar diligências por CNJ.' });
  }
});

// POST /api/diligencias — cria uma ou várias (array aceito para migração em lote)
app.post('/api/diligencias', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const input = req.body;
  const items = Array.isArray(input) ? input : [input];
  const rows = items.map(diligenciaToSnake);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .upsert(rows, { onConflict: 'id' })
      .select();
    if (error) {
      console.error('Erro POST /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao criar diligência.' });
    }
    const result = data.map(diligenciaToCamel);
    res.status(201).json(Array.isArray(input) ? result : result[0]);
  } catch (err) {
    console.error('Erro POST /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao criar diligência.' });
  }
});

// PUT /api/diligencias/:id
app.put('/api/diligencias/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { id } = req.params;
  const updates = diligenciaToSnake({ id, ...req.body });
  // Remove null fields to avoid overwriting optional fields with null
  Object.keys(updates).forEach(k => updates[k] === null && delete updates[k]);
  try {
    const { data, error } = await supabase
      .from('diligencias')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Erro PUT /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao atualizar diligência.' });
    }
    res.json(diligenciaToCamel(data));
  } catch (err) {
    console.error('Erro PUT /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao atualizar diligência.' });
  }
});

// DELETE /api/diligencias/:id
app.delete('/api/diligencias/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('diligencias')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Erro DELETE /api/diligencias:', error.message);
      return res.status(500).json({ error: 'Erro interno ao excluir diligência.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro DELETE /api/diligencias:', err.message);
    res.status(500).json({ error: 'Erro interno ao excluir diligência.' });
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
