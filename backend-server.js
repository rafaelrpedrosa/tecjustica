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
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// ── Multi-provider AI ────────────────────────────────────────────────────────
function buildAIProvider() {
  const preferred = (process.env.AI_PROVIDER || '').toLowerCase()
  const candidates = preferred
    ? [preferred, 'anthropic', 'openai', 'gemini']
    : ['anthropic', 'openai', 'gemini']

  for (const p of [...new Set(candidates)]) {
    if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY)
      return { name: 'anthropic', client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }
    if (p === 'openai' && process.env.OPENAI_API_KEY)
      return { name: 'openai', client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) }
    if (p === 'gemini' && process.env.GEMINI_API_KEY)
      return { name: 'gemini', client: new GoogleGenerativeAI(process.env.GEMINI_API_KEY) }
  }
  return null
}
const aiProvider = buildAIProvider()
if (aiProvider) console.log(`[IA] Provedor ativo: ${aiProvider.name}`)
else console.warn('[IA] Nenhuma chave de IA configurada — /api/ia/chat retornará 503')

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Nível 1 — Geral: todas as rotas /api/*
 * 300 req / minuto por IP (5 req/s) — permite polling + operações normais
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento e tente novamente.' },
  skip: (req) => req.path === '/api/health',
});

/**
 * Nível 2 — MCP intensivo: buscas e leitura de documentos
 * 60 req / minuto por IP — cada chamada consome crédito no MCP externo
 */
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de consultas atingido (60/min). Aguarde antes de realizar nova busca.' },
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
    console.warn(`[audit] Exceção ao registrar ${acao}:`, err instanceof Error ? err.message : String(err));
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
      console.warn(`⚠️ Não foi possível listar tools:`, e instanceof Error ? e.message : String(e));
    }

    return mcpClient;
  } catch (error) {
    console.error(`❌ Erro ao inicializar MCP Client:`, error instanceof Error ? error.message : String(error));
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
      const msg        = error instanceof Error ? error.message : String(error);
      const isTimeout  = msg.includes('Timeout');
      const isSession  = msg.includes('session') || msg.includes('connect');
      const label      = isTimeout ? '⏱ TIMEOUT' : isSession ? '🔌 SESSÃO' : '❌ ERRO';

      console.error(`${label} tentativa ${attempt}/${MAX_RETRIES} — ${toolName}: ${msg}`);

      // Descarta cliente para forçar reconexão
      mcpClient = null;
      clientConnected = false;

      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
      }
    }
  }

  // Esgotou tentativas
  console.error(`💀 ${toolName} falhou após ${MAX_RETRIES} tentativas. Último erro: ${lastError?.message}`);
  throw lastError;
}

// ─── Validação de inputs ──────────────────────────────────────────────────────

const CNJ_RE  = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida UUID v4.
 * @param {string} id
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateUUID(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'ID ausente' };
  const clean = id.trim();
  if (!UUID_RE.test(clean)) return { ok: false, error: 'ID com formato inválido' };
  return { ok: true, value: clean };
}

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
  // Ancorado ao início — evita falso positivo para textos com "não encontrado" em partes/documentos
  return /^(NAO encontrado|não encontrado|Processo não encontrado|Erro:|.*retornou HTTP [45])/i.test(text.trim());
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
function movementHash(mov) {
  return mov.hash_unico || `${mov.data || ''}-${mov.tipo || ''}-${mov.descricao || ''}`.slice(0, 240);
}

async function hydrateProcessCache(cnj, movementLimit = 100) {
  if (!supabase) return null;

  let processo = null;
  const { data: existing } = await supabase
    .from('processes')
    .select('id, cnj, tribunal, classe, assunto, status, valor, juiz, data_abertura')
    .eq('cnj', cnj)
    .maybeSingle();

  processo = existing || null;

  if (!processo || !processo.data_abertura || !processo.tribunal || !processo.classe || !processo.assunto) {
    try {
      const result = await callMCPTool('pdpj_visao_geral_processo', { numero_processo: cnj });
      const { text, isError } = parseMCPResponse(result, 'pdpj_visao_geral_processo');
      if (text && !isError && !isMCPError(text)) {
        const parsed = parseVisaoGeral(text, cnj);
        const { data: upserted } = await supabase
          .from('processes')
          .upsert({
            cnj,
            tribunal: parsed.tribunal || null,
            classe: parsed.classe || null,
            assunto: parsed.assunto || null,
            status: parsed.status || null,
            valor: parsed.valor || null,
            juiz: parsed.juiz || null,
            data_abertura: parsed.data_abertura || null,
            json_resumo: parsed,
          }, { onConflict: 'cnj' })
          .select('id, cnj, tribunal, classe, assunto, status, valor, juiz, data_abertura')
          .single();
        processo = upserted || processo;
      }
    } catch (err) {
      console.warn(`[hydrateProcessCache] Falha ao hidratar visao geral de ${cnj}:`, err.message);
    }
  }

  if (!processo?.id) return processo;

  const { count: movementCount } = await supabase
    .from('process_movements')
    .select('*', { count: 'exact', head: true })
    .eq('process_id', processo.id);

  if (!movementCount) {
    try {
      const result = await callMCPTool('pdpj_list_movimentos', { numero_processo: cnj, limit: movementLimit });
      const { text, isError } = parseMCPResponse(result, 'pdpj_list_movimentos');
      if (text && !isError) {
        const movimentos = parseMovimentos(text);
        if (movimentos.length > 0) {
          const rows = movimentos.map(mov => ({
            process_id: processo.id,
            data: mov.data,
            descricao: mov.descricao || mov.tipo || 'Movimento processual',
            orgao: mov.orgao || null,
            tipo: mov.tipo || null,
            hash_unico: movementHash(mov),
          }));
          const { error } = await supabase
            .from('process_movements')
            .upsert(rows, { onConflict: 'hash_unico' });
          if (error) console.warn(`[hydrateProcessCache] Falha ao salvar movimentos de ${cnj}:`, error.message);
        }
      }
    } catch (err) {
      console.warn(`[hydrateProcessCache] Falha ao hidratar movimentos de ${cnj}:`, err.message);
    }
  }

  return processo;
}

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
 * POST /api/process/documentos/conteudo-batch - Ler conteúdo de múltiplos documentos
 * Body: { numero_processo: string, documento_ids: string[] }
 */
app.post('/api/process/documentos/conteudo-batch', mcpLimiter, async (req, res) => {
  try {
    const { numero_processo, documento_ids } = req.body;

    if (!numero_processo || !Array.isArray(documento_ids) || documento_ids.length === 0) {
      return res.status(400).json({ error: 'numero_processo e documento_ids (array) são obrigatórios' });
    }

    try {
      const result = await callMCPTool('pdpj_read_documentos_batch', {
        numero_processo,
        documento_ids,
      });
      const { text, isError } = parseMCPResponse(result, 'pdpj_read_documentos_batch');
      if (!text || isError || isMCPError(text)) {
        return res.status(404).json({ error: text || 'Documentos não encontrados ou sem conteúdo' });
      }
      audit(req, 'READ_DOCUMENTOS_BATCH', 'document', numero_processo);
      res.json({ conteudo: text, documento_ids });
    } catch (mcpError) {
      console.error('❌ MCP Error (batch):', mcpError.message);
      res.status(404).json({ error: 'Documentos não encontrados ou indisponíveis no momento' });
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
      clienteId: e.cliente_id,
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

    const { cnj, clienteNome, clientePolo, clienteId, responsavel, vara, monitorar = true, notas } = req.body;

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
        cliente_id: clienteId || null,
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
            valor: parsed.valor || null,
            juiz: parsed.juiz || null,
            data_abertura: parsed.data_abertura || null,
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
      clienteId: cadastro.cliente_id,
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
    const { clienteNome, clientePolo, clienteId, responsavel, vara, monitorar, notas } = req.body;

    if (clienteNome !== undefined) updates.cliente_nome = clienteNome;
    if (clientePolo !== undefined) {
      if (!['ATIVO', 'PASSIVO', 'TERCEIRO'].includes(clientePolo)) {
        return res.status(400).json({ error: 'clientePolo deve ser ATIVO, PASSIVO ou TERCEIRO' });
      }
      updates.cliente_polo = clientePolo;
    }
    if (clienteId !== undefined) updates.cliente_id = clienteId;
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

        try {
          await createMovementApprovalDraft({
            registro,
            cnj,
            movimento: movimentosNovos[0],
          });
        } catch (notifyErr) {
          console.warn('?????? Erro ao preparar mensagem para aprovacao humana:', notifyErr.message);
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
        try {
          if (shouldSendQuarterlyStatus(registro.last_client_notification_at)) {
            await createQuarterlyApprovalDraft({
              registro,
              cnj,
              movimento: movimentos[0] || null,
            });
          }
        } catch (notifyErr) {
          console.warn('?????? Erro ao preparar atualizacao trimestral para aprovacao humana:', notifyErr.message);
        }
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
          .from('escritorio_processos').select('*').eq('cnj', cnj).single();

        if (!reg) continue;
        const hashNovo = movimentos[0].hash_unico ||
          `${movimentos[0].data || ''}-${(movimentos[0].descricao || '').slice(0, 50)}`;

        if (reg.ultimo_hash_movimento !== hashNovo) {
          const descricao = `Novo movimento: ${(movimentos[0].descricao || '').slice(0, 200)}`;
          await supabase.from('escritorio_alertas').insert({ cnj, tipo: 'NOVO_MOVIMENTO', descricao });
          try {
            await createMovementApprovalDraft({
              registro: reg,
              cnj,
              movimento: movimentos[0],
            });
          } catch (notifyErr) {
            console.warn(`?????? Erro ao preparar mensagem para aprovacao humana em ${cnj}:`, notifyErr.message);
          }
          await supabase.from('escritorio_processos')
            .update({ ultimo_hash_movimento: hashNovo, ultima_verificacao: new Date().toISOString() })
            .eq('cnj', cnj);
        } else {
          try {
            if (shouldSendQuarterlyStatus(reg.last_client_notification_at)) {
              await createQuarterlyApprovalDraft({
                registro: reg,
                cnj,
                movimento: movimentos[0] || null,
              });
            }
          } catch (notifyErr) {
            console.warn(`?????? Erro ao preparar atualizacao trimestral para aprovacao humana em ${cnj}:`, notifyErr.message);
          }
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

function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '') }
function diasEntre(d1, d2) { return Math.round((new Date(d2) - new Date(d1)) / 86400000) }
function findMov(movs, padroes) {
  return movs.find(m => padroes.some(p => norm(m.descricao).includes(norm(p))))
}
function media(arr) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null }

/**
 * POST /api/escritorio/sincronizar-assuntos
 * Atualiza campo assunto de todos os processos do escritório que estão sem assunto no Supabase
 */
app.post('/api/escritorio/sincronizar-assuntos', mcpLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  try {
    const { data: eps } = await supabase.from('escritorio_processos').select('cnj')
    if (!eps || eps.length === 0) return res.json({ atualizados: 0, total: 0 })

    const cnjs = eps.map(e => e.cnj)
    const { data: processos } = await supabase
      .from('processes')
      .select('cnj, assunto')
      .in('cnj', cnjs)

    const semAssunto = (processos || [])
      .filter(p => !p.assunto)
      .map(p => p.cnj)

    // CNJs do escritório que nem existem ainda na tabela processes
    const existentes = new Set((processos || []).map(p => p.cnj))
    const inexistentes = cnjs.filter(c => !existentes.has(c))
    const paraAtualizar = [...new Set([...semAssunto, ...inexistentes])]

    if (paraAtualizar.length === 0) return res.json({ atualizados: 0, total: cnjs.length })

    let atualizados = 0
    const erros = []
    for (let i = 0; i < paraAtualizar.length; i++) {
      const cnj = paraAtualizar[i]
      await (async (cnj) => {
        try {
          const result = await callMCPTool('pdpj_visao_geral_processo', { numero_processo: cnj })
          const { text, isError } = parseMCPResponse(result, 'pdpj_visao_geral_processo')
          if (!text || isError) {
            console.warn(`[sincronizar-assuntos] MCP sem texto para ${cnj} (isError=${isError})`)
            erros.push({ cnj, motivo: 'mcp_sem_texto' })
            return
          }
          if (isMCPError(text)) {
            console.warn(`[sincronizar-assuntos] MCP retornou erro para ${cnj}: ${text.substring(0, 80)}`)
            erros.push({ cnj, motivo: 'mcp_erro', detalhe: text.substring(0, 80) })
            return
          }
          const parsed = parseVisaoGeral(text, cnj)
          if (!parsed.assunto) {
            // Log primeiros 200 chars para entender o formato da resposta
            console.warn(`[sincronizar-assuntos] assunto não encontrado para ${cnj}. Início do texto: ${text.substring(0, 200)}`)
            erros.push({ cnj, motivo: 'assunto_vazio' })
          }
          // Upsert mesmo sem assunto — salva tribunal/classe/data para outras métricas
          const { error: upsertErr } = await supabase.from('processes').upsert({
            cnj,
            tribunal: parsed.tribunal || null,
            classe: parsed.classe || null,
            assunto: parsed.assunto || null,
            status: parsed.status || null,
            valor: parsed.valor > 0 ? parsed.valor : null,
            juiz: parsed.juiz || null,
            data_abertura: parsed.data_abertura || null,
          }, { onConflict: 'cnj' })
          if (upsertErr) {
            console.error(`[sincronizar-assuntos] upsert falhou para ${cnj}:`, upsertErr.message)
            erros.push({ cnj, motivo: 'upsert_erro', detalhe: upsertErr.message })
            return
          }
          atualizados++
        } catch (err) {
          console.warn(`[sincronizar-assuntos] Falha em ${cnj}:`, err.message)
          erros.push({ cnj, motivo: 'excecao', detalhe: err.message })
        }
      })(cnj)
      // Pausa entre chamadas para não saturar o servidor MCP
      if (i < paraAtualizar.length - 1) await new Promise(r => setTimeout(r, 1500))
    }

    res.json({ atualizados, total: cnjs.length, semAssunto: paraAtualizar.length, erros })
  } catch (err) {
    console.error('sincronizar-assuntos erro:', err.message)
    res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
})

/**
 * GET /api/escritorio/metricas-tempo
 * Métricas de tempo processual por tribunal e tipo de ação
 */
app.get('/api/escritorio/metricas-tempo', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  try {
    const periodo = req.query.periodo || 'tudo'

    // 1. CNJs monitorados
    const { data: eps, error: epsErr } = await supabase
      .from('escritorio_processos').select('cnj')
    if (epsErr) {
      console.error('metricas-tempo escritorio:', epsErr.message)
      return res.status(500).json({ error: 'Erro interno ao processar operação.' })
    }
    if (!eps || eps.length === 0) {
      return res.json({
        porTribunal: [], porTipoAcao: [],
        resumo: { totalProcessos: 0, processosComMovimentos: 0, processosComSentenca: 0, processosEmLiquidacao: 0, mediaGeralDias: null },
      })
    }

    const cnjs = eps.map(e => e.cnj)

    // Usar dados cacheados no Supabase — sem chamadas MCP ao vivo.
    // Busca processes + movements separadamente e faz join em memória.
    let procQuery = supabase
      .from('processes')
      .select('id, cnj, tribunal, classe, assunto, data_abertura')
      .in('cnj', cnjs)

    if (periodo === '6m') {
      procQuery = procQuery.gte('data_abertura', new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10))
    } else if (periodo === '1a') {
      procQuery = procQuery.gte('data_abertura', new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10))
    }

    const { data: processos, error: procErr } = await procQuery
    if (procErr) {
      console.error('metricas-tempo processos:', procErr.message)
      return res.status(500).json({ error: 'Erro interno ao processar operação.' })
    }

    // Buscar movimentações de todos os processos encontrados
    const processIds = (processos || []).map(p => p.id).filter(Boolean)
    let movimentacoesMap = {}

    if (processIds.length > 0) {
      const { data: movRows } = await supabase
        .from('process_movements')
        .select('process_id, data, descricao')
        .in('process_id', processIds)

      for (const m of (movRows || [])) {
        if (!movimentacoesMap[m.process_id]) movimentacoesMap[m.process_id] = []
        movimentacoesMap[m.process_id].push({ data: m.data, descricao: m.descricao })
      }
    }

    // Montar lista base com dados do Supabase
    const base = cnjs.map(cnj => {
      const p = (processos || []).find(x => x.cnj === cnj)
      const movements = p ? (movimentacoesMap[p.id] || []) : []
      return {
        cnj,
        tribunal: p?.tribunal || null,
        classe: p?.classe || null,
        assunto: p?.assunto || null,
        data_abertura: p?.data_abertura || null,
        process_movements: movements,
      }
    })

    // Fallback MCP para processos sem movimentos no Supabase (máx 5 concorrentes)
    const semMovimentos = base.filter(p => p.process_movements.length === 0)
    const CONCORRENCIA = 5
    for (let i = 0; i < semMovimentos.length; i += CONCORRENCIA) {
      const lote = semMovimentos.slice(i, i + CONCORRENCIA)
      await Promise.all(lote.map(async (p) => {
        try {
          const [visaoRes, movsRes] = await Promise.all([
            p.tribunal ? null : callMCPTool('pdpj_visao_geral_processo', { numero_processo: p.cnj }),
            callMCPTool('pdpj_list_movimentos', { numero_processo: p.cnj, limit: 100 }),
          ])
          if (visaoRes) {
            const { text } = parseMCPResponse(visaoRes, 'pdpj_visao_geral_processo')
            if (text && !isMCPError(text)) {
              const parsed = parseVisaoGeral(text, p.cnj)
              p.tribunal = parsed.tribunal || p.tribunal || 'Não informado'
              p.classe = parsed.classe || p.classe || 'Não informado'
              p.data_abertura = parsed.data_abertura || p.data_abertura
            }
          }
          const { text: movsText } = parseMCPResponse(movsRes, 'pdpj_list_movimentos')
          if (movsText && !isMCPError(movsText)) {
            p.process_movements = parseMovimentos(movsText).map(m => ({ data: m.data, descricao: m.descricao || '' }))
          }
        } catch (err) {
          console.warn(`[metricas-tempo] MCP fallback falhou para ${p.cnj}:`, err.message)
        }
      }))
    }

    const processosEnriquecidos = base
      .map(p => ({ ...p, tribunal: p.tribunal || 'Não informado', classe: p.classe || 'Não informado', assunto: p.assunto || null }))
      .filter(p => p.process_movements.length > 0)

    // 3. Padrões de detecção de fases
    const SENTENCA = ['sentença', 'julgado', 'procedente', 'improcedente', 'dispositivo', 'resolv']
    const LIQUIDACAO = ['liquidação', 'cumprimento de sentença', 'execução de título', 'cálculo de liquidação', 'rpv', 'precatório', 'requisição de pagamento']

    // 4. Calcular métricas
    const byTribunal = {}
    const byTipo = {}
    const byFase = {}
    const byAssunto = {}
    let totalComMovimentos = 0, totalComSentenca = 0, totalEmLiquidacao = 0
    const temposTotais = []

    for (const p of processosEnriquecidos || []) {
      const movs = (p.process_movements || []).sort((a, b) => new Date(a.data) - new Date(b.data))
      if (movs.length === 0) continue
      totalComMovimentos++

      const tribunal = p.tribunal || 'Não informado'
      const tipo = p.classe || 'Não informado'
      if (!byTribunal[tribunal]) byTribunal[tribunal] = { distSentencaDias: [], sentLiquidDias: [] }

      // Assunto — contar todos os processos com movimentos, independente de data_abertura
      const assunto = p.assunto || 'Não informado'
      if (!byAssunto[assunto]) byAssunto[assunto] = { total: 0 }
      byAssunto[assunto].total++

      if (!p.data_abertura) continue

      if (!byTipo[tipo]) byTipo[tipo] = { temposTotais: [], total: 0 }
      byTipo[tipo].total++

      const movSentenca = findMov(movs, SENTENCA)
      const movsAposSentenca = movSentenca
        ? movs.filter(m => new Date(m.data) >= new Date(movSentenca.data))
        : []
      const movLiquidacao = movsAposSentenca.length ? findMov(movsAposSentenca, LIQUIDACAO) : null
      const ultimaMov = movs[movs.length - 1]

      if (movSentenca) {
        const dias = diasEntre(p.data_abertura, movSentenca.data)
        if (dias >= 0) {
          totalComSentenca++
          byTribunal[tribunal].distSentencaDias.push(dias)
        }
      }
      if (movLiquidacao && movSentenca) {
        totalEmLiquidacao++
        byTribunal[tribunal].sentLiquidDias.push(diasEntre(movSentenca.data, movLiquidacao.data))
      }
      const tempoTotal = diasEntre(p.data_abertura, ultimaMov.data)
      temposTotais.push(tempoTotal)
      byTipo[tipo].temposTotais.push(tempoTotal)

      // Fase processual detectada
      const fase = movLiquidacao ? 'Liquidação / Execução' : movSentenca ? 'Sentenciado' : 'Conhecimento'
      if (!byFase[fase]) byFase[fase] = { total: 0, temposTotais: [] }
      byFase[fase].total++
      byFase[fase].temposTotais.push(tempoTotal)

    }

    const porTribunal = Object.entries(byTribunal).map(([tribunal, d]) => ({
      tribunal,
      mediaDistribuicaoSentenca: media(d.distSentencaDias),
      mediaSentencaLiquidacao: media(d.sentLiquidDias),
      totalComSentenca: d.distSentencaDias.length,
      totalEmLiquidacao: d.sentLiquidDias.length,
    })).sort((a, b) => b.totalComSentenca - a.totalComSentenca)

    const porTipoAcao = Object.entries(byTipo).map(([tipoAcao, d]) => ({
      tipoAcao,
      totalProcessos: d.total,
      mediaTempoTotal: media(d.temposTotais),
    })).sort((a, b) => b.totalProcessos - a.totalProcessos)

    const porFase = Object.entries(byFase).map(([fase, d]) => ({
      fase,
      totalProcessos: d.total,
      mediaTempoTotal: media(d.temposTotais),
    })).sort((a, b) => b.totalProcessos - a.totalProcessos)

    const porAssunto = Object.entries(byAssunto).map(([assunto, d]) => ({
      assunto,
      totalProcessos: d.total,
    })).sort((a, b) => b.totalProcessos - a.totalProcessos).slice(0, 10)

    return res.json({
      porTribunal,
      porTipoAcao,
      porFase,
      porAssunto,
      resumo: {
        totalProcessos: cnjs.length,
        processosComMovimentos: totalComMovimentos,
        processosComSentenca: totalComSentenca,
        processosEmLiquidacao: totalEmLiquidacao,
        mediaGeralDias: media(temposTotais),
      },
    })
  } catch (err) {
    console.error('metricas-tempo erro inesperado:', err.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
})

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

    const idV = validateUUID(req.params.id);
    if (!idV.ok) return res.status(400).json({ error: idV.error });

    const { error } = await supabase
      .from('escritorio_alertas')
      .update({ lido: true })
      .eq('id', idV.value);

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

/**
 * GET /api/escritorio/status
 * Combined endpoint: returns both alertas count and urgentes count
 * Reduces polling requests from 2 per cycle to 1
 */
app.get('/api/escritorio/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    // Fetch alertas in parallel with diligencias
    const [alertasResult, diligenciasResult] = await Promise.all([
      supabase
        .from('escritorio_alertas')
        .select('id')
        .eq('lido', false)
        .limit(50),
      supabase
        .from('diligencias')
        .select('*')
        .order('data_criacao', { ascending: false })
    ]);

    const alertasError = alertasResult.error;
    const diligenciasError = diligenciasResult.error;

    if (alertasError) {
      console.error('Erro ao buscar alertas em /api/escritorio/status:', alertasError.message);
      return res.status(500).json({ error: 'Erro ao buscar alertas' });
    }

    if (diligenciasError) {
      console.error('Erro ao buscar diligências em /api/escritorio/status:', diligenciasError.message);
      return res.status(500).json({ error: 'Erro ao buscar diligências' });
    }

    const alertasCount = (alertasResult.data || []).length;
    const urgentesCount = (diligenciasResult.data || [])
      .filter(d => d.prioridade === 'URGENTE' && d.status !== 'CONCLUIDA')
      .length;

    res.json({
      alertasCount,
      urgentesCount
    });
  } catch (error) {
    console.error('Erro GET /api/escritorio/status:', error.message);
    res.status(500).json({ error: 'Erro ao buscar status' });
  }
});

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
  const updates = diligenciaToSnake(req.body);
  // Strip null values — prevents overwriting optional DB fields when caller omits them.
  // NOTE: This means optional fields (responsavel, dataPrevista, retorno, etc.)
  // cannot be explicitly cleared to NULL via this endpoint. Acceptable for current UI.
  Object.keys(updates).forEach(k => updates[k] === null && delete updates[k]);
  delete updates.id; // id is used in the .eq() filter only, not in the update payload
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

// POST /api/financeiro/clientes/sync
app.post('/api/financeiro/clientes/sync', generalLimiter, async (req, res) => {
  try {
    const { clienteId } = req.body || {}
    if (!clienteId) return res.status(400).json({ error: 'clienteId e obrigatorio.' })
    const synced = await syncClienteAsaasById(clienteId)
    return res.json(synced)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 500
    console.error('POST /api/financeiro/clientes/sync:', msg)
    return res.status(status).json({ error: msg })
  }
})

// GET /api/financeiro/cobrancas
app.get('/api/financeiro/cobrancas', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase nao configurado' })
  try {
    let query = supabase
      .from('financeiro_cobrancas')
      .select('*, clientes(*)')
      .order('created_at', { ascending: false })

    if (req.query.clienteId) query = query.eq('cliente_id', req.query.clienteId)
    if (req.query.status) query = query.eq('status', req.query.status)

    const { data, error } = await query
    if (error) throw error
    return res.json((data || []).map(financeiroCobrancaToCamel))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('GET /api/financeiro/cobrancas:', msg)
    return res.status(500).json({ error: 'Erro interno ao processar operacao.' })
  }
})

// GET /api/financeiro/cobrancas/:id
app.get('/api/financeiro/cobrancas/:id', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase nao configurado' })
  try {
    const { data, error } = await supabase
      .from('financeiro_cobrancas')
      .select('*, clientes(*)')
      .eq('id', req.params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Cobranca nao encontrada.' })
      throw error
    }

    return res.json(financeiroCobrancaToCamel(data))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('GET /api/financeiro/cobrancas/:id:', msg)
    return res.status(500).json({ error: 'Erro interno ao processar operacao.' })
  }
})

// POST /api/financeiro/cobrancas
app.post('/api/financeiro/cobrancas', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase nao configurado' })
  try {
    const { clienteId, processoCnj, descricao, valor, billingType, dueDate } = req.body || {}
    if (!clienteId || !descricao?.trim() || !valor || !dueDate) {
      return res.status(400).json({ error: 'clienteId, descricao, valor e dueDate sao obrigatorios.' })
    }

    const amount = Number(valor)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valor invalido para cobranca.' })
    }

    const mapping = await syncClienteAsaasById(clienteId)
    const config = await resolveAsaasConfig()

    const charge = await asaasRequest(config, '/payments', {
      method: 'POST',
      body: {
        customer: mapping.gatewayCustomerId,
        billingType: billingType || 'PIX',
        value: amount,
        dueDate,
        description: descricao.trim(),
        externalReference: processoCnj || clienteId,
      },
    })

    const payload = {
      cliente_id: clienteId,
      processo_cnj: processoCnj || null,
      gateway: 'asaas',
      gateway_charge_id: charge.id,
      gateway_customer_id: mapping.gatewayCustomerId,
      descricao: descricao.trim(),
      valor: amount,
      billing_type: charge.billingType || billingType || 'PIX',
      status: charge.status || 'PENDING',
      due_date: charge.dueDate || dueDate,
      invoice_url: charge.invoiceUrl || null,
      bank_slip_url: charge.bankSlipUrl || null,
      pix_qr_code: charge.pixTransaction?.qrCode?.encodedImage || null,
      pix_copy_paste: charge.pixTransaction?.payload || null,
      external_reference: charge.externalReference || processoCnj || clienteId,
      last_payload_json: charge,
      paid_at: charge.clientPaymentDate || null,
    }

    const { data, error } = await supabase
      .from('financeiro_cobrancas')
      .insert(payload)
      .select('*, clientes(*)')
      .single()

    if (error) throw error
    return res.status(201).json(financeiroCobrancaToCamel(data))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 500
    console.error('POST /api/financeiro/cobrancas:', msg)
    return res.status(status).json({ error: msg })
  }
})

// POST /api/financeiro/cobrancas/:id/sync
app.post('/api/financeiro/cobrancas/:id/sync', generalLimiter, async (req, res) => {
  try {
    const cobranca = await syncFinanceiroCobrancaById(req.params.id)
    return res.json(cobranca)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 500
    console.error('POST /api/financeiro/cobrancas/:id/sync:', msg)
    return res.status(status).json({ error: msg })
  }
})

// POST /api/financeiro/webhooks/asaas
app.post('/api/financeiro/webhooks/asaas', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase nao configurado' })
  try {
    const config = await resolveAsaasConfig()
    const headerToken = req.headers['asaas-access-token']
    if (config.webhookToken && headerToken !== config.webhookToken) {
      return res.status(401).json({ error: 'Webhook Asaas nao autorizado.' })
    }

    const eventType = req.body?.event || 'UNKNOWN'
    const payment = req.body?.payment || {}
    const chargeId = payment.id || null

    const { error: eventError } = await supabase
      .from('financeiro_eventos')
      .insert({
        gateway: 'asaas',
        event_type: eventType,
        gateway_object_id: chargeId,
        payload_json: req.body || {},
      })

    if (eventError) throw eventError

    if (chargeId) {
      const updates = {
        status: payment.status || 'PENDING',
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
        pix_qr_code: payment.pixTransaction?.qrCode?.encodedImage || null,
        pix_copy_paste: payment.pixTransaction?.payload || null,
        paid_at: payment.clientPaymentDate || payment.confirmedDate || null,
        due_date: payment.dueDate || null,
        last_payload_json: req.body || {},
        updated_at: new Date().toISOString(),
      }

      const { error: chargeError } = await supabase
        .from('financeiro_cobrancas')
        .update(updates)
        .eq('gateway', 'asaas')
        .eq('gateway_charge_id', chargeId)

      if (chargeError) throw chargeError
    }

    return res.status(204).send()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('POST /api/financeiro/webhooks/asaas:', msg)
    return res.status(500).json({ error: 'Erro ao processar webhook do Asaas.' })
  }
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── IA Chat ──────────────────────────────────────────────────────────────────
async function resolveAIProvider() {
  // Busca chaves salvas no Supabase (prioridade sobre env)
  if (supabase) {
    const keys = ['anthropicToken', 'openaiToken', 'geminiToken']
    const results = await Promise.all(keys.map(k =>
      supabase.from('settings').select('value').eq('key', k).maybeSingle()
    ))
    const [anthRow, oaiRow, gemRow] = results.map(r => r.data?.value || '')

    if (anthRow && anthRow !== 'your-api-key-here') {
      try { return { name: 'anthropic', client: new Anthropic({ apiKey: anthRow }) } } catch {}
    }
    if (oaiRow && oaiRow !== 'your-api-key-here') {
      try { return { name: 'openai', client: new OpenAI({ apiKey: oaiRow }) } } catch {}
    }
    if (gemRow && gemRow !== 'your-api-key-here') {
      try { return { name: 'gemini', client: new GoogleGenerativeAI(gemRow) } } catch {}
    }
  }
  // Fallback: env vars (ignora placeholders)
  const envAnth = process.env.ANTHROPIC_API_KEY
  const envOai  = process.env.OPENAI_API_KEY
  const envGem  = process.env.GEMINI_API_KEY
  if (envAnth && envAnth !== 'your-api-key-here')
    return { name: 'anthropic', client: new Anthropic({ apiKey: envAnth }) }
  if (envOai  && envOai  !== 'your-api-key-here')
    return { name: 'openai',    client: new OpenAI({ apiKey: envOai }) }
  if (envGem  && envGem  !== 'your-api-key-here')
    return { name: 'gemini',    client: new GoogleGenerativeAI(envGem) }
  return null
}

app.get('/api/ia/status', generalLimiter, async (_req, res) => {
  const provider = await resolveAIProvider()
  res.json({
    configurado: !!provider,
    provedor: provider?.name ?? null,
  })
})

async function getSettingValue(key) {
  if (!supabase) return null
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? null
}

async function resolveAsaasConfig() {
  const [environment, apiKey, webhookToken] = await Promise.all([
    getSettingValue('asaasEnvironment'),
    getSettingValue('asaasApiKey'),
    getSettingValue('asaasWebhookToken'),
  ])

  const envName = environment === 'production' ? 'production' : 'sandbox'
  const baseUrl = envName === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3'

  return {
    environment: envName,
    apiKey: apiKey || null,
    webhookToken: webhookToken || null,
    baseUrl,
  }
}

async function asaasRequest(config, path, options = {}) {
  if (!config?.apiKey) {
    const err = new Error('Asaas nao configurado. Preencha ambiente e API key nas configuracoes.')
    err.statusCode = 503
    throw err
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'JusFlow/1.0 (financeiro)',
      'access_token': config.apiKey,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const raw = await response.text()
  const parsed = raw ? (() => {
    try { return JSON.parse(raw) } catch { return raw }
  })() : null

  if (!response.ok) {
    const details = parsed?.errors?.[0]?.description || parsed?.message || parsed || `HTTP ${response.status}`
    const err = new Error(typeof details === 'string' ? details : JSON.stringify(details))
    err.statusCode = response.status
    err.payload = parsed
    throw err
  }

  return parsed
}

function financeiroClienteGatewayToCamel(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    gateway: row.gateway,
    gatewayCustomerId: row.gateway_customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function financeiroCobrancaToCamel(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    processoCnj: row.processo_cnj || undefined,
    gateway: row.gateway,
    gatewayChargeId: row.gateway_charge_id,
    gatewayCustomerId: row.gateway_customer_id || undefined,
    descricao: row.descricao,
    valor: Number(row.valor || 0),
    billingType: row.billing_type,
    status: row.status,
    dueDate: row.due_date,
    invoiceUrl: row.invoice_url || undefined,
    bankSlipUrl: row.bank_slip_url || undefined,
    pixQrCode: row.pix_qr_code || undefined,
    pixCopyPaste: row.pix_copy_paste || undefined,
    externalReference: row.external_reference || undefined,
    paidAt: row.paid_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cliente: row.clientes ? clienteToCamel(row.clientes) : undefined,
  }
}

async function syncFinanceiroCobrancaById(id) {
  if (!supabase) {
    const err = new Error('Supabase nao configurado')
    err.statusCode = 503
    throw err
  }

  const current = await supabase
    .from('financeiro_cobrancas')
    .select('*, clientes(*)')
    .eq('id', id)
    .single()

  if (current.error || !current.data) {
    const err = new Error('Cobranca nao encontrada.')
    err.statusCode = 404
    throw err
  }

  const config = await resolveAsaasConfig()
  const charge = await asaasRequest(config, `/payments/${current.data.gateway_charge_id}`)

  const updates = {
    gateway_customer_id: charge.customer || current.data.gateway_customer_id || null,
    billing_type: charge.billingType || current.data.billing_type,
    status: charge.status || current.data.status,
    due_date: charge.dueDate || current.data.due_date,
    invoice_url: charge.invoiceUrl || current.data.invoice_url || null,
    bank_slip_url: charge.bankSlipUrl || current.data.bank_slip_url || null,
    pix_qr_code: current.data.pix_qr_code || null,
    pix_copy_paste: current.data.pix_copy_paste || null,
    external_reference: charge.externalReference || current.data.external_reference || null,
    paid_at: charge.clientPaymentDate || charge.confirmedDate || current.data.paid_at || null,
    last_payload_json: charge,
    updated_at: new Date().toISOString(),
  }

  const updated = await supabase
    .from('financeiro_cobrancas')
    .update(updates)
    .eq('id', id)
    .select('*, clientes(*)')
    .single()

  if (updated.error) throw new Error(updated.error.message)
  return financeiroCobrancaToCamel(updated.data)
}

async function syncClienteAsaasById(clienteId) {
  if (!supabase) {
    const err = new Error('Supabase nao configurado')
    err.statusCode = 503
    throw err
  }

  const existingResult = await supabase
    .from('financeiro_clientes_gateway')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('gateway', 'asaas')
    .maybeSingle()

  if (existingResult.error) {
    throw new Error(existingResult.error.message)
  }
  if (existingResult.data) {
    return financeiroClienteGatewayToCamel(existingResult.data)
  }

  const clienteResult = await supabase
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .single()

  if (clienteResult.error || !clienteResult.data) {
    const err = new Error('Cliente nao encontrado para sincronizacao.')
    err.statusCode = 404
    throw err
  }

  const config = await resolveAsaasConfig()
  const cliente = clienteResult.data
  const customer = await asaasRequest(config, '/customers', {
    method: 'POST',
    body: {
      name: cliente.nome,
      cpfCnpj: cliente.cpf_cnpj || undefined,
      email: cliente.email || undefined,
      mobilePhone: cliente.whatsapp || undefined,
      notificationDisabled: false,
    },
  })

  const gatewayResult = await supabase
    .from('financeiro_clientes_gateway')
    .insert({
      cliente_id: cliente.id,
      gateway: 'asaas',
      gateway_customer_id: customer.id,
    })
    .select()
    .single()

  if (gatewayResult.error) {
    throw new Error(gatewayResult.error.message)
  }

  return financeiroClienteGatewayToCamel(gatewayResult.data)
}

async function resolveChatwootConfig() {
  const [baseUrl, accountId, inboxId, apiToken, enabled, movementTypes] = await Promise.all([
    getSettingValue('chatwootBaseUrl'),
    getSettingValue('chatwootAccountId'),
    getSettingValue('chatwootInboxId'),
    getSettingValue('chatwootApiToken'),
    getSettingValue('chatwootEnabled'),
    getSettingValue('chatwootMovementTypes'),
  ])

  return {
    enabled: enabled !== 'false',
    baseUrl: baseUrl?.replace(/\/+$/, '') || null,
    accountId: accountId || null,
    inboxId: inboxId || null,
    apiToken: apiToken || null,
    movementTypes: movementTypes || 'sentenca,decisao,audiencia,intimacao,pagamento,encerramento',
  }
}

function getMovementCategories(text) {
  const normalized = norm(text)
  const categories = new Set()

  if (['sentenca', 'acordao', 'transitado em julgado', 'conclusos para julgamento'].some(pattern => normalized.includes(pattern))) {
    categories.add('sentenca')
  }
  if (['decisao', 'despacho'].some(pattern => normalized.includes(pattern))) {
    categories.add('decisao')
  }
  if (['audiencia', 'pericia'].some(pattern => normalized.includes(pattern))) {
    categories.add('audiencia')
  }
  if (['intimacao', 'expedicao', 'mandado'].some(pattern => normalized.includes(pattern))) {
    categories.add('intimacao')
  }
  if (['alvara', 'rpv', 'precatorio', 'pagamento', 'cumprimento de sentenca'].some(pattern => normalized.includes(pattern))) {
    categories.add('pagamento')
  }
  if (['arquivado', 'baixa definitiva'].some(pattern => normalized.includes(pattern))) {
    categories.add('encerramento')
  }

  return categories
}

async function isMovementWorthNotifying(text) {
  const config = await resolveChatwootConfig()
  const enabledTypes = new Set(
    String(config.movementTypes || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )
  const categories = getMovementCategories(text)
  return Array.from(categories).some(category => enabledTypes.has(category))
}

function getPrimaryMovementCategory(text) {
  const categories = getMovementCategories(text)
  const priority = ['sentenca', 'pagamento', 'encerramento', 'audiencia', 'decisao', 'intimacao']
  return priority.find(category => categories.has(category)) || 'geral'
}

function getMovementTemplate(category) {
  const templates = {
    sentenca: {
      resumo: 'O processo recebeu uma decis?o importante do juiz ou do tribunal.',
      impacto: 'Isso costuma ser um avan?o relevante, mas ainda pode haver recurso ou nova etapa.',
      tom: 'Explique como avan?o importante, sem prometer resultado final.',
    },
    decisao: {
      resumo: 'Houve uma decis?o ou despacho que faz o processo andar.',
      impacto: 'Isso normalmente organiza a pr?xima fase ou define alguma provid?ncia no caso.',
      tom: 'Explique que o processo andou e que seguimos acompanhando.',
    },
    audiencia: {
      resumo: 'Foi marcada, realizada ou atualizada uma audi?ncia ou per?cia.',
      impacto: 'Essa etapa ajuda o processo a produzir prova e esclarecer pontos importantes.',
      tom: 'Use linguagem pr?tica e diga se ? uma fase de prova ou comparecimento.',
    },
    intimacao: {
      resumo: 'Saiu uma comunica??o oficial do processo.',
      impacto: 'Nem sempre exige a??o imediata do cliente, mas ? uma atualiza??o importante.',
      tom: 'Deixe claro se parece apenas ci?ncia do andamento.',
    },
    pagamento: {
      resumo: 'A movimenta??o fala de valores, pagamento ou fase de cumprimento.',
      impacto: 'Isso pode aproximar o processo da etapa financeira, mas ainda pode haver tr?mites.',
      tom: 'Seja cuidadoso para n?o prometer recebimento imediato.',
    },
    encerramento: {
      resumo: 'O processo foi arquivado, baixado ou entrou em fase de encerramento.',
      impacto: 'Isso geralmente indica fechamento ou pausa relevante do caso.',
      tom: 'Explique como encerramento prov?vel, mas sem afirmar sem ressalvas.',
    },
    geral: {
      resumo: 'Houve uma nova atualiza??o no processo.',
      impacto: 'O caso seguiu para uma nova etapa e continuamos acompanhando.',
      tom: 'Use linguagem simples e objetiva.',
    },
  }

  return templates[category] || templates.geral
}

function buildLeigoFallback({ clienteNome, cnj, movimento }) {
  const data = movimento?.data
    ? new Date(movimento.data).toLocaleDateString('pt-BR')
    : 'recentemente'
  const descricao = movimento?.descricao || movimento?.tipo || 'houve uma nova movimentação'
  return `Olá, ${clienteNome}. Tivemos uma atualização no processo ${cnj} em ${data}. Em termos simples: ${descricao}. Se quiser, podemos analisar com mais detalhe e explicar os próximos passos.`
}

async function explainMovementForClient({ clienteNome, cnj, movimento }) {
  const provider = await resolveAIProvider()
  if (!provider) return buildLeigoFallback({ clienteNome, cnj, movimento })

  const prompt =
    `Explique para um cliente leigo, em português do Brasil, a movimentação processual abaixo.\n` +
    `Regras: seja simples, acolhedor e objetivo; não use juridiquês; não invente; não prometa resultado; termine oferecendo ajuda.\n\n` +
    `Cliente: ${clienteNome}\n` +
    `Processo: ${cnj}\n` +
    `Data da movimentação: ${movimento?.data || 'não informada'}\n` +
    `Tipo: ${movimento?.tipo || 'não informado'}\n` +
    `Descrição: ${movimento?.descricao || 'não informada'}`

  try {
    if (provider.name === 'anthropic') {
      const r = await provider.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: 'Você transforma andamentos processuais em mensagens simples para clientes de escritório de advocacia.',
        messages: [{ role: 'user', content: prompt }],
      })
      return r.content[0].text
    }

    if (provider.name === 'openai') {
      const r = await provider.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'Você transforma andamentos processuais em mensagens simples para clientes de escritório de advocacia.' },
          { role: 'user', content: prompt },
        ],
      })
      return r.choices[0].message.content || buildLeigoFallback({ clienteNome, cnj, movimento })
    }

    if (provider.name === 'gemini') {
      const model = provider.client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const r = await model.generateContent(prompt)
      return r.response.text()
    }
  } catch (err) {
    console.warn('Falha ao gerar explicação leiga:', err.message)
  }

  return buildLeigoFallback({ clienteNome, cnj, movimento })
}

async function chatwootRequest(config, path, options = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      api_access_token: config.apiToken,
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Chatwoot ${response.status}: ${body.slice(0, 300)}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function normalizePhoneToWhatsAppId(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  // Garante DDI 55 para números brasileiros sem DDI
  let normalized = digits
  if (digits.length === 10 || digits.length === 11) normalized = '55' + digits
  return `${normalized}@s.whatsapp.net`
}

function normalizePhoneToE164(phone) {
  if (!phone) return null

  const raw = String(phone).trim()
  if (!raw) return null

  const hasPlusPrefix = raw.startsWith('+')
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null

  if (hasPlusPrefix) {
    return `+${digits}`
  }

  if (digits.startsWith('00')) {
    return `+${digits.slice(2)}`
  }

  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`
  }

  return digits.length >= 8 ? `+${digits}` : null
}

async function findOrCreateChatwootContact(config, cliente) {
  const normalizedPhone = normalizePhoneToE164(cliente.whatsapp)

  try {
    const existing = await chatwootRequest(
      config,
      `/api/v1/accounts/${config.accountId}/contacts/search?q=${encodeURIComponent(normalizedPhone || cliente.whatsapp || cliente.nome)}`
    )
    const found = existing?.payload?.find(item =>
      item.phone_number === normalizedPhone || item.phone_number === cliente.whatsapp || item.name === cliente.nome
    )
    if (found) {
      // Atualizar identifier para @s.whatsapp.net se ainda estiver no formato antigo "manual-*"
      if (cliente.id && (!found.identifier || found.identifier.startsWith('manual-'))) {
        try {
          await chatwootRequest(config, `/api/v1/accounts/${config.accountId}/contacts/${found.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ identifier: cliente.id }),
          })
        } catch (patchErr) {
          console.warn('Falha ao atualizar identifier do contato:', patchErr.message)
        }
      }
      return found
    }
  } catch (err) {
    console.warn('Falha ao pesquisar contato no Chatwoot:', err.message)
  }

  if (cliente.whatsapp && !normalizedPhone) {
    throw new Error('Numero de WhatsApp invalido. Use DDI e DDD, por exemplo: +5585999999999')
  }

  return chatwootRequest(config, `/api/v1/accounts/${config.accountId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: Number(config.inboxId),
      name: cliente.nome,
      phone_number: normalizedPhone || undefined,
      email: cliente.email || undefined,
      identifier: cliente.id,
    }),
  })
}

async function sendProcessUpdateToChatwoot({ cliente, processo, movimento }) {
  const config = await resolveChatwootConfig()
  if (!config.enabled || !config.baseUrl || !config.accountId || !config.inboxId || !config.apiToken) return false
  if (!cliente?.whatsapp) return false
  if (!(await isMovementWorthNotifying(`${movimento?.tipo || ''} ${movimento?.descricao || ''}`))) return false

  const contact = await findOrCreateChatwootContact(config, cliente)
  const sourceId = contact?.contact_inboxes?.[0]?.source_id || contact?.pubsub_token || cliente.id
  const conversation = await chatwootRequest(config, `/api/v1/accounts/${config.accountId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({
      source_id: String(sourceId),
      inbox_id: Number(config.inboxId),
      contact_id: Number(contact.id),
      status: 'open',
    }),
  })

  const content = await explainMovementForClient({
    clienteNome: cliente.nome,
    cnj: processo.cnj,
    movimento,
  })

  await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    }
  )
  return true
}

async function sendManualChatwootMessage({ nome, whatsapp, mensagem }) {
  const config = await resolveChatwootConfig()
  if (!config.enabled || !config.baseUrl || !config.accountId || !config.inboxId || !config.apiToken) {
    throw new Error('Chatwoot não configurado.')
  }

  // Formato exigido pelo Chatwoot com Evolution API / WhatsApp Baileys
  const whatsappId = normalizePhoneToWhatsAppId(whatsapp)
  if (!whatsappId) throw new Error('Número de WhatsApp inválido para envio.')

  const contact = await findOrCreateChatwootContact(config, {
    id: whatsappId,   // identifier = source_id no inbox WhatsApp
    nome,
    whatsapp,
  })

  // source_id DEVE ser sempre o formato @s.whatsapp.net para Evolution API.
  // Nunca usar contact_inboxes[0].source_id — pode ter formato antigo "manual-*".
  const sourceId = whatsappId

  const conversation = await chatwootRequest(config, `/api/v1/accounts/${config.accountId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({
      source_id: String(sourceId),
      inbox_id: Number(config.inboxId),
      contact_id: Number(contact.id),
      status: 'open',
    }),
  })

  await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: mensagem,
        message_type: 'outgoing',
        private: false,
      }),
    }
  )
}

function clientMessageApprovalToCamel(row) {
  if (!row) return null
  return {
    id: row.id,
    cnj: row.cnj,
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    clienteWhatsapp: row.cliente_whatsapp,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    titulo: row.titulo,
    draftMessage: row.draft_message,
    status: row.status,
    payloadJson: row.payload_json || {},
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getQuarterlyReference(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return `${date.getFullYear()}-Q${quarter}`
}

async function createClientMessageApproval({
  cnj,
  cliente,
  sourceType,
  sourceReference,
  titulo,
  draftMessage,
  payloadJson = {},
}) {
  if (!supabase) throw new Error('Supabase nÃ£o configurado.')
  if (!cliente?.nome || !cliente?.whatsapp) {
    throw new Error('Cliente sem nome ou WhatsApp para notificacao.')
  }

  const { data: existing } = await supabase
    .from('client_message_approvals')
    .select('*')
    .eq('cnj', cnj)
    .eq('source_type', sourceType)
    .eq('source_reference', sourceReference)
    .maybeSingle()

  if (existing && existing.status !== 'REJECTED') {
    return clientMessageApprovalToCamel(existing)
  }

  if (existing?.status === 'REJECTED') {
    const { data, error } = await supabase
      .from('client_message_approvals')
      .update({
        cliente_id: cliente.id || null,
        cliente_nome: cliente.nome,
        cliente_whatsapp: cliente.whatsapp || null,
        titulo: titulo || null,
        draft_message: draftMessage,
        status: 'PENDING',
        payload_json: payloadJson,
        approved_at: null,
        sent_at: null,
        rejected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw error
    return clientMessageApprovalToCamel(data)
  }

  const { data, error } = await supabase
    .from('client_message_approvals')
    .insert({
      cnj,
      cliente_id: cliente.id || null,
      cliente_nome: cliente.nome,
      cliente_whatsapp: cliente.whatsapp || null,
      source_type: sourceType,
      source_reference: sourceReference,
      titulo: titulo || null,
      draft_message: draftMessage,
      status: 'PENDING',
      payload_json: payloadJson,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) throw error
  return clientMessageApprovalToCamel(data)
}

function buildDocumentFallback({ clienteNome, cnj, documento }) {
  const data = documento?.dataCriacao
    ? new Date(documento.dataCriacao).toLocaleDateString('pt-BR')
    : 'recentemente'
  const tipo = documento?.tipo || 'documento'
  const titulo = documento?.titulo || 'novo documento'
  return `OlÃ¡, ${clienteNome}. Preparamos uma comunicacao sobre o processo ${cnj}. Foi juntado um ${tipo} em ${data}, identificado como "${titulo}". Se quiser, podemos te explicar em linguagem simples o que isso representa no andamento do caso.`
}

async function explainDocumentForClient({ clienteNome, cnj, documento }) {
  const provider = await resolveAIProvider()
  if (!provider) return buildDocumentFallback({ clienteNome, cnj, documento })

  const prompt =
    `Explique para um cliente leigo, em portugues do Brasil, a entrada de um documento processual.\n` +
    `Regras: simples, acolhedor, objetivo, sem juridiques, sem inventar, sem prometer resultado, e termine oferecendo ajuda.\n\n` +
    `Cliente: ${clienteNome}\n` +
    `Processo: ${cnj}\n` +
    `Documento: ${documento?.titulo || 'nao informado'}\n` +
    `Tipo: ${documento?.tipo || 'nao informado'}\n` +
    `Data: ${documento?.dataCriacao || 'nao informada'}\n` +
    `Paginas: ${documento?.paginas || 'nao informado'}`

  try {
    if (provider.name === 'anthropic') {
      const r = await provider.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: 'Voce transforma documentos processuais em mensagens simples para clientes de escritorio de advocacia.',
        messages: [{ role: 'user', content: prompt }],
      })
      return r.content[0].text
    }

    if (provider.name === 'openai') {
      const r = await provider.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'Voce transforma documentos processuais em mensagens simples para clientes de escritorio de advocacia.' },
          { role: 'user', content: prompt },
        ],
      })
      return r.choices[0].message.content || buildDocumentFallback({ clienteNome, cnj, documento })
    }

    if (provider.name === 'gemini') {
      const model = provider.client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const r = await model.generateContent(prompt)
      return r.response.text()
    }
  } catch (err) {
    console.warn('Falha ao gerar explicacao leiga do documento:', err.message)
  }

  return buildDocumentFallback({ clienteNome, cnj, documento })
}

async function createMovementApprovalDraft({ registro, cnj, movimento, manual = false }) {
  const cliente = await findClientForProcess(registro)
  if (!cliente) {
    throw new Error('Nenhum cliente vinculado foi encontrado para este processo.')
  }
  if (!cliente?.whatsapp) {
    throw new Error(`O cliente ${cliente.nome} esta sem WhatsApp cadastrado.`)
  }
  if (!manual && !(await isMovementWorthNotifying(`${movimento?.tipo || ''} ${movimento?.descricao || ''}`))) {
    throw new Error('Essa movimentacao nao esta habilitada para notificacao ao cliente.')
  }

  // Usa hash_unico como fingerprint estável. Nunca usa movimento.id pois
  // parseMovimentos gera IDs sintéticos (mov-1, mov-2) que se repetem a cada fetch.
  const sourceReferenceBase = movimento?.hash_unico ||
    `${movimento?.data || ''}-${(movimento?.tipo || '')}-${(movimento?.descricao || '').slice(0, 80)}`

  const draftMessage = await explainMovementForClient({
    clienteNome: cliente.nome,
    cnj,
    movimento,
  })

  return createClientMessageApproval({
    cnj,
    cliente,
    sourceType: manual ? 'MOVIMENTO_MANUAL' : 'MOVIMENTO_AUTO',
    sourceReference: manual ? `${sourceReferenceBase}-${Date.now()}` : sourceReferenceBase,
    titulo: movimento?.tipo || 'Movimentacao processual',
    draftMessage,
    payloadJson: {
      movement: movimento || {},
      category: getPrimaryMovementCategory(`${movimento?.tipo || ''} ${movimento?.descricao || ''}`),
    },
  })
}

async function createDocumentApprovalDraft({ registro, cnj, documento }) {
  const cliente = await findClientForProcess(registro)
  if (!cliente) {
    throw new Error('Nenhum cliente vinculado foi encontrado para este processo.')
  }
  if (!cliente?.whatsapp) {
    throw new Error(`O cliente ${cliente.nome} esta sem WhatsApp cadastrado.`)
  }

  const draftMessage = await explainDocumentForClient({
    clienteNome: cliente.nome,
    cnj,
    documento,
  })

  return createClientMessageApproval({
    cnj,
    cliente,
    sourceType: 'DOCUMENTO_MANUAL',
    sourceReference: `${documento?.id || 'documento'}-${Date.now()}`,
    titulo: documento?.titulo || documento?.tipo || 'Documento processual',
    draftMessage,
    payloadJson: {
      document: documento || {},
    },
  })
}

function shouldSendQuarterlyStatus(lastNotificationAt) {
  if (!lastNotificationAt) return true
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
  return Date.now() - new Date(lastNotificationAt).getTime() >= ninetyDaysMs
}

function buildQuarterlyStatusFallback({ clienteNome, cnj, movimento }) {
  if (movimento?.data) {
    const data = new Date(movimento.data).toLocaleDateString('pt-BR')
    const descricao = movimento.descricao || movimento.tipo || 'sem detalhe adicional'
    return `Olá, ${clienteNome}. Passando para te atualizar sobre o processo ${cnj}. Neste período, seguimos acompanhando o caso e a movimentação mais recente que consta para nós é de ${data}: ${descricao}. Se quiser, podemos te explicar com calma o que isso significa na prática.`
  }

  return `Olá, ${clienteNome}. Passando para te atualizar sobre o processo ${cnj}. Neste momento, seguimos acompanhando normalmente e não identificamos uma novidade relevante desde o último retorno. Se quiser, podemos te explicar com calma a situação atual do processo.`
}

async function explainQuarterlyStatusForClient({ clienteNome, cnj, movimento }) {
  const provider = await resolveAIProvider()
  if (!provider) return buildQuarterlyStatusFallback({ clienteNome, cnj, movimento })

  const prompt =
    `Escreva uma atualização trimestral para um cliente leigo sobre o processo abaixo.\n` +
    `Regras: português do Brasil, simples, acolhedor, sem juridiquês, sem inventar fatos, sem prometer resultado, e com no máximo 5 frases.\n\n` +
    `Cliente: ${clienteNome}\n` +
    `Processo: ${cnj}\n` +
    `Última movimentação conhecida: ${movimento?.data || 'não informada'}\n` +
    `Tipo da última movimentação: ${movimento?.tipo || 'não informado'}\n` +
    `Descrição da última movimentação: ${movimento?.descricao || 'não informada'}\n` +
    `Objetivo: avisar que estamos acompanhando o processo mesmo sem novidade relevante recente.`

  try {
    if (provider.name === 'anthropic') {
      const r = await provider.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 220,
        system: 'Você escreve mensagens curtas de atualização processual para clientes de escritório de advocacia.',
        messages: [{ role: 'user', content: prompt }],
      })
      return r.content[0].text
    }

    if (provider.name === 'openai') {
      const r = await provider.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'Você escreve mensagens curtas de atualização processual para clientes de escritório de advocacia.' },
          { role: 'user', content: prompt },
        ],
      })
      return r.choices[0].message.content || buildQuarterlyStatusFallback({ clienteNome, cnj, movimento })
    }

    if (provider.name === 'gemini') {
      const model = provider.client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const r = await model.generateContent(prompt)
      return r.response.text()
    }
  } catch (err) {
    console.warn('Falha ao gerar atualização trimestral leiga:', err.message)
  }

  return buildQuarterlyStatusFallback({ clienteNome, cnj, movimento })
}

async function createQuarterlyApprovalDraft({ registro, cnj, movimento }) {
  const cliente = await findClientForProcess(registro)
  if (!cliente) {
    throw new Error('Nenhum cliente vinculado foi encontrado para este processo.')
  }
  if (!cliente?.whatsapp) {
    throw new Error(`O cliente ${cliente.nome} esta sem WhatsApp cadastrado.`)
  }

  const draftMessage = await explainQuarterlyStatusForClient({
    clienteNome: cliente.nome,
    cnj,
    movimento,
  })

  return createClientMessageApproval({
    cnj,
    cliente,
    sourceType: 'STATUS_TRIMESTRAL',
    sourceReference: getQuarterlyReference(),
    titulo: 'Atualizacao trimestral do processo',
    draftMessage,
    payloadJson: {
      movement: movimento || null,
      kind: 'quarterly_status',
    },
  })
}

async function sendQuarterlyStatusToChatwoot({ cliente, processo, movimento }) {
  const config = await resolveChatwootConfig()
  if (!config.enabled || !config.baseUrl || !config.accountId || !config.inboxId || !config.apiToken) return false
  if (!cliente?.whatsapp) return false

  const contact = await findOrCreateChatwootContact(config, cliente)
  const sourceId = contact?.contact_inboxes?.[0]?.source_id || contact?.pubsub_token || cliente.id
  const conversation = await chatwootRequest(config, `/api/v1/accounts/${config.accountId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({
      source_id: String(sourceId),
      inbox_id: Number(config.inboxId),
      contact_id: Number(contact.id),
      status: 'open',
    }),
  })

  const content = await explainQuarterlyStatusForClient({
    clienteNome: cliente.nome,
    cnj: processo.cnj,
    movimento,
  })

  await chatwootRequest(
    config,
    `/api/v1/accounts/${config.accountId}/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    }
  )

  return true
}

async function markClientNotificationSent(cnj, type) {
  if (!supabase) return
  await supabase
    .from('escritorio_processos')
    .update({
      last_client_notification_at: new Date().toISOString(),
      last_client_notification_type: type,
    })
    .eq('cnj', cnj)
}

async function findClientForProcess(registro) {
  if (!supabase) return null

  if (registro?.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', registro.cliente_id)
      .maybeSingle()
    if (data) return clienteToCamel(data)
  }

  if (registro?.cliente_nome) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .ilike('nome', registro.cliente_nome)
      .limit(1)
    if (data?.[0]) return clienteToCamel(data[0])
  }

  return null
}

app.get('/api/client-messages/pending/:cnj', generalLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase nÃ£o configurado' })

    const cnjRaw = decodeURIComponent(req.params.cnj)
    const cnjV = validateCNJ(cnjRaw)
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error })

    const { data, error } = await supabase
      .from('client_message_approvals')
      .select('*')
      .eq('cnj', cnjV.value)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })

    if (error) throw error
    return res.json((data || []).map(clientMessageApprovalToCamel))
  } catch (err) {
    console.error('client-messages/pending erro:', err.message)
    return res.status(500).json({ error: 'Erro ao listar mensagens pendentes.' })
  }
})

app.post('/api/client-messages/draft/movement', generalLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase nÃ£o configurado' })

    const { cnj: cnjRaw, movement } = req.body || {}
    const cnjV = validateCNJ(cnjRaw)
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error })
    if (!movement?.descricao?.trim()) {
      return res.status(400).json({ error: 'descricao da movimentacao Ã© obrigatoria.' })
    }

    const { data: registro, error: regError } = await supabase
      .from('escritorio_processos')
      .select('*')
      .eq('cnj', cnjV.value)
      .single()

    if (regError || !registro) {
      return res.status(404).json({ error: 'Processo nÃ£o encontrado no cadastro do escritÃ³rio.' })
    }

    const draft = await createMovementApprovalDraft({
      registro,
      cnj: cnjV.value,
      movimento: movement,
      manual: true,
    })

    if (!draft) {
      return res.status(400).json({ error: 'NÃ£o foi possÃ­vel preparar a mensagem. Verifique se hÃ¡ cliente vinculado, WhatsApp cadastrado e categoria habilitada.' })
    }

    return res.status(201).json(draft)
  } catch (err) {
    console.error('client-messages/draft/movement erro:', err.message)
    return res.status(500).json({ error: 'Erro ao preparar mensagem da movimentacao.', details: err.message })
  }
})

app.post('/api/client-messages/draft/document', generalLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase nÃ£o configurado' })

    const { cnj: cnjRaw, document } = req.body || {}
    const cnjV = validateCNJ(cnjRaw)
    if (!cnjV.ok) return res.status(400).json({ error: cnjV.error })
    if (!document?.id || !document?.titulo?.trim()) {
      return res.status(400).json({ error: 'id e titulo do documento sÃ£o obrigatÃ³rios.' })
    }

    const { data: registro, error: regError } = await supabase
      .from('escritorio_processos')
      .select('*')
      .eq('cnj', cnjV.value)
      .single()

    if (regError || !registro) {
      return res.status(404).json({ error: 'Processo nÃ£o encontrado no cadastro do escritÃ³rio.' })
    }

    const draft = await createDocumentApprovalDraft({
      registro,
      cnj: cnjV.value,
      documento: document,
    })

    if (!draft) {
      return res.status(400).json({ error: 'NÃ£o foi possÃ­vel preparar a mensagem. Verifique se hÃ¡ cliente vinculado e WhatsApp cadastrado.' })
    }

    return res.status(201).json(draft)
  } catch (err) {
    console.error('client-messages/draft/document erro:', err.message)
    return res.status(500).json({ error: 'Erro ao preparar mensagem do documento.', details: err.message })
  }
})

app.post('/api/client-messages/:id/approve-send', generalLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase nÃ£o configurado' })

    const id = req.params.id
    const { draftMessage } = req.body || {}
    const { data: row, error } = await supabase
      .from('client_message_approvals')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !row) {
      return res.status(404).json({ error: 'Mensagem pendente nÃ£o encontrada.' })
    }
    if (row.status !== 'PENDING') {
      return res.status(400).json({ error: 'A mensagem nÃ£o estÃ¡ mais pendente de aprovaÃ§Ã£o.' })
    }

    const content = String(draftMessage || row.draft_message || '').trim()
    if (!content) {
      return res.status(400).json({ error: 'A mensagem a ser enviada estÃ¡ vazia.' })
    }

    await sendManualChatwootMessage({
      nome: row.cliente_nome,
      whatsapp: row.cliente_whatsapp,
      mensagem: content,
    })

    const notificationType = row.source_type === 'STATUS_TRIMESTRAL' ? 'trimestral' : 'manual_aprovado'
    await markClientNotificationSent(row.cnj, notificationType)

    const { error: updateError } = await supabase
      .from('client_message_approvals')
      .update({
        draft_message: content,
        status: 'SENT',
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) throw updateError
    return res.json({ success: true })
  } catch (err) {
    console.error('client-messages/approve-send erro:', err.message)
    return res.status(500).json({ error: 'Erro ao aprovar e enviar mensagem ao cliente.', details: err.message })
  }
})

app.post('/api/client-messages/:id/reject', generalLimiter, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase nÃ£o configurado' })

    const id = req.params.id
    const { error } = await supabase
      .from('client_message_approvals')
      .update({
        status: 'REJECTED',
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'PENDING')

    if (error) throw error
    return res.json({ success: true })
  } catch (err) {
    console.error('client-messages/reject erro:', err.message)
    return res.status(500).json({ error: 'Erro ao rejeitar mensagem pendente.' })
  }
})

app.post('/api/chatwoot/test', generalLimiter, async (req, res) => {
  const { nome, whatsapp, mensagem } = req.body || {}
  if (!nome?.trim() || !whatsapp?.trim() || !mensagem?.trim()) {
    return res.status(400).json({ error: 'nome, whatsapp e mensagem são obrigatórios.' })
  }

  try {
    await sendManualChatwootMessage({
      nome: nome.trim(),
      whatsapp: whatsapp.trim(),
      mensagem: mensagem.trim(),
    })
    return res.json({ success: true })
  } catch (err) {
    console.error('chatwoot/test erro:', err.message)
    return res.status(500).json({
      error: 'Erro ao enviar mensagem teste ao Chatwoot.',
    })
  }
})

app.post('/api/ia/chat', mcpLimiter, async (req, res) => {
  const aiProvider = await resolveAIProvider()
  if (!aiProvider) return res.status(503).json({
    error: 'IA não configurada. Adicione uma chave de API em Configurações.'
  })

  const { cnj, pergunta, historico = [] } = req.body
  if (!pergunta?.trim()) return res.status(400).json({ error: 'Pergunta obrigatória.' })

  try {
    let contextoProcesso = ''
    if (cnj) {
      try {
        const [visao, movs, analise, listaDocRes] = await Promise.allSettled([
          callMCPTool('pdpj_visao_geral_processo', { numero_processo: cnj }),
          callMCPTool('pdpj_list_movimentos', { numero_processo: cnj, limit: 15 }),
          callMCPTool('pdpj_analise_essencial', { numero_processo: cnj }),
          callMCPTool('pdpj_list_documentos', { numero_processo: cnj, limit: 20 }),
        ])
        if (visao.status === 'rejected') console.warn('[ia/chat] visao_geral falhou:', visao.reason?.message)
        if (movs.status === 'rejected') console.warn('[ia/chat] list_movimentos falhou:', movs.reason?.message)
        if (analise.status === 'rejected') console.warn('[ia/chat] analise_essencial falhou:', analise.reason?.message)
        if (listaDocRes.status === 'rejected') console.warn('[ia/chat] list_documentos falhou:', listaDocRes.reason?.message)
        if (visao.status === 'fulfilled')
          contextoProcesso += `\n\n## Visão Geral ${cnj}\n` +
            JSON.stringify(parseMCPResponse(visao.value, 'pdpj_visao_geral_processo'), null, 2)
        if (movs.status === 'fulfilled')
          contextoProcesso += `\n\n## Últimas Movimentações\n` +
            JSON.stringify(parseMCPResponse(movs.value, 'pdpj_list_movimentos'), null, 2)
        if (analise.status === 'fulfilled' && analise.value)
          contextoProcesso += `\n\n## Análise de Documentos (peças iniciais e decisões)\n` +
            JSON.stringify(parseMCPResponse(analise.value, 'pdpj_analise_essencial'), null, 2)

        // Ler conteúdo dos documentos mais relevantes via batch
        if (listaDocRes.status === 'fulfilled' && listaDocRes.value) {
          const listaDoc = parseDocumentos(parseMCPResponse(listaDocRes.value, 'pdpj_list_documentos').text || '')
          const PRIORIDADE = /sentença|decisão|acórdão|tutela|despacho|intimação|petição inicial|contestação/i
          let relevantes = listaDoc
            .filter(d => PRIORIDADE.test(d.titulo || d.tipo || ''))
            .slice(0, 5)
          // Fallback: se nenhum doc prioritário, usa os 5 primeiros da lista
          if (!relevantes.length) {
            relevantes = listaDoc.slice(0, 5)
          }
          if (relevantes.length) {
            try {
              const batchResult = await callMCPTool('pdpj_read_documentos_batch', {
                numero_processo: cnj,
                documento_ids: relevantes.map(d => d.id),
              })
              const { text: batchText } = parseMCPResponse(batchResult, 'pdpj_read_documentos_batch')
              if (batchText && !isMCPError(batchText)) {
                contextoProcesso += `\n\n## Conteúdo dos Documentos\n${batchText.slice(0, 30000)}`
              } else {
                // Fallback individual se batch falhar
                const leituras = await Promise.allSettled(
                  relevantes.map(d => callMCPTool('pdpj_read_documento', {
                    numero_processo: cnj,
                    documento_id: d.id,
                  }))
                )
                leituras.forEach((r, i) => {
                  if (r.status === 'fulfilled' && r.value) {
                    const { text } = parseMCPResponse(r.value, 'pdpj_read_documento')
                    if (text && !isMCPError(text)) {
                      contextoProcesso += `\n\n## Documento: ${relevantes[i].titulo || relevantes[i].tipo}\n${text.slice(0, 6000)}`
                    }
                  }
                })
              }
            } catch {
              // Fallback individual se batch lançar exceção
              const leituras = await Promise.allSettled(
                relevantes.map(d => callMCPTool('pdpj_read_documento', {
                  numero_processo: cnj,
                  documento_id: d.id,
                }))
              )
              leituras.forEach((r, i) => {
                if (r.status === 'fulfilled' && r.value) {
                  const { text } = parseMCPResponse(r.value, 'pdpj_read_documento')
                  if (text && !isMCPError(text)) {
                    contextoProcesso += `\n\n## Documento: ${relevantes[i].titulo || relevantes[i].tipo}\n${text.slice(0, 6000)}`
                  }
                }
              })
            }
          }
        }
      } catch (mcpErr) {
        console.error('ia/chat MCP error:', mcpErr.message)
        contextoProcesso = '\n\n[Dados do processo indisponíveis no momento]'
      }
    }

    const systemPrompt =
      'Você é um assistente jurídico especializado integrado ao sistema JusFlow.\n' +
      'Responda em português, de forma clara e objetiva para advogados e colaboradores.\n' +
      'Cite datas e números quando relevante. Não invente informações.\n' +
      (contextoProcesso ? `\nDados do processo consultado:${contextoProcesso}` : '')

    const messages = [
      ...historico.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: pergunta },
    ]

    let resposta = ''

    if (aiProvider.name === 'anthropic') {
      const r = await aiProvider.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })
      resposta = r.content[0].text

    } else if (aiProvider.name === 'openai') {
      const r = await aiProvider.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      })
      resposta = r.choices[0].message.content

    } else if (aiProvider.name === 'gemini') {
      const model = aiProvider.client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        systemInstruction: systemPrompt,
      })
      const r = await chat.sendMessage(pergunta)
      resposta = r.response.text()
    }

    return res.json({ resposta, provedor: aiProvider.name })
  } catch (err) {
    console.error('ia/chat erro:', err.message)
    return res.status(500).json({ error: 'Erro interno ao processar a pergunta.' })
  }
})

// ── Clientes ─────────────────────────────────────────────────────────────────
function formatCpfCnpj(value) {
  if (!value) return value
  const digits = String(value).replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function clienteToCamel(c) {
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpf_cnpj ? formatCpfCnpj(c.cpf_cnpj) : undefined,
    whatsapp: c.whatsapp ?? undefined,
    email: c.email ?? undefined,
    notas: c.notas ?? undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}

function clienteToSnake(input) {
  const out = {}
  if (input.nome !== undefined) out.nome = input.nome
  if (input.cpfCnpj !== undefined) out.cpf_cnpj = input.cpfCnpj
  if (input.whatsapp !== undefined) out.whatsapp = input.whatsapp
  if (input.email !== undefined) out.email = input.email
  if (input.notas !== undefined) out.notas = input.notas
  return out
}

// GET /api/clientes — listar todos
app.get('/api/clientes', generalLimiter, async (_req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nome', { ascending: true })
  if (error) {
    console.error('GET /api/clientes:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  console.log('GET /api/clientes — dados retornados:', data?.length || 0, 'clientes')
  if (data && data.length > 0) {
    console.log('  Primeiro cliente:', data[0])
  }
  return res.json((data || []).map(clienteToCamel))
})

// GET /api/clientes/:id — buscar por id
app.get('/api/clientes/:id', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Cliente não encontrado.' })
    console.error('GET /api/clientes/:id:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.json(clienteToCamel(data))
})

// POST /api/clientes — criar
app.post('/api/clientes', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { nome, cpfCnpj, whatsapp, email, notas } = req.body
  if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório.' })
  const payload = clienteToSnake({ nome: nome.trim(), cpfCnpj, whatsapp, email, notas })
  const { data, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select()
    .single()
  if (error) {
    console.error('POST /api/clientes:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.status(201).json(clienteToCamel(data))
})

// PUT /api/clientes/:id — atualizar
app.put('/api/clientes/:id', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const updates = clienteToSnake(req.body)
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  updates.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Cliente não encontrado.' })
    console.error('PUT /api/clientes/:id:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.json(clienteToCamel(data))
})

// DELETE /api/clientes/:id — remover
app.delete('/api/clientes/:id', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', req.params.id)
  if (error) {
    console.error('DELETE /api/clientes/:id:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.status(204).send()
})

// ─── Settings (Configurações) ────────────────────────────────────────────────

// POST /api/settings — salvar configuração
app.post('/api/settings', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { key, value } = req.body
  if (!key?.trim()) return res.status(400).json({ error: 'Chave é obrigatória.' })

  const { data, error } = await supabase
    .from('settings')
    .upsert({ key: key.trim(), value }, { onConflict: 'key' })
    .select()
    .single()

  if (error) {
    console.error('POST /api/settings:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.json(data)
})

const SETTINGS_ALLOWLIST = new Set([
  'anthropicToken', 'openaiToken', 'geminiToken',
  'chatwootBaseUrl', 'chatwootApiToken', 'chatwootInboxId',
  'chatwootAccountId', 'chatwootEnabled', 'chatwootMovementTypes',
  'asaasEnvironment', 'asaasApiKey', 'asaasWebhookToken',
])

// GET /api/settings/:key — obter configuração
app.get('/api/settings/:key', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  if (!SETTINGS_ALLOWLIST.has(req.params.key)) {
    return res.status(400).json({ error: 'Chave de configuração inválida.' })
  }
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', req.params.key)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Configuração não encontrada.' })
    console.error('GET /api/settings/:key:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.json(data)
})

// DELETE /api/settings/:key — deletar configuração
app.delete('/api/settings/:key', generalLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' })
  const { error } = await supabase
    .from('settings')
    .delete()
    .eq('key', req.params.key)

  if (error) {
    console.error('DELETE /api/settings/:key:', error.message)
    return res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
  return res.status(204).send()
})

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend API Server rodando em http://localhost:${PORT}`);
  console.log(`📡 MCP Server: ${MCP_SERVER_URL}`);
  console.log(`📡 Usando Streamable HTTP transport para comunicação MCP`);
});

// Graceful shutdown — fecha conexões antes de encerrar
function gracefulShutdown(signal) {
  console.log(`\n[shutdown] Sinal ${signal} recebido. Encerrando servidor...`);
  server.close(() => {
    console.log('[shutdown] Servidor encerrado com sucesso.');
    process.exit(0);
  });
  // Force exit após 10s se alguma conexão travar
  setTimeout(() => {
    console.warn('[shutdown] Timeout — forçando encerramento.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));







