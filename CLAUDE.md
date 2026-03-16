# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a configuration workspace for the **TecJustica 3.0 Lite** MCP server — a tool for querying Brazilian judicial processes via the PDPJ/CNJ DataLake.

## MCP Server

The `tecjustica` MCP server is registered via HTTP transport:

```
URL: https://tecjusticamcp-lite-production.up.railway.app/mcp
Transport: HTTP
Auth: Bearer token (stored in .env as TECJUSTICA_AUTH_TOKEN)
```

To register or update the MCP server:
```bash
claude mcp add --transport http tecjustica "https://tecjusticamcp-lite-production.up.railway.app/mcp" --header "Authorization: Bearer <TOKEN>"
```

To check connection status:
```bash
claude mcp list
```

Tokens are obtained by logging in at `https://tecjusticamcp-lite-production.up.railway.app/login`.

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `pdpj_visao_geral_processo` | Full process summary from CNJ number |
| `pdpj_buscar_processos` | Find processes by CPF/CNPJ |
| `pdpj_buscar_precedentes` | Search jurisprudence and súmulas |
| `pdpj_list_partes` | List parties and lawyers |
| `pdpj_list_movimentos` | Process timeline/events |
| `pdpj_list_documentos` | List available documents |
| `pdpj_read_documento` | Read a single document's text |
| `pdpj_read_documentos_batch` | Read up to 50 documents at once |
| `pdpj_get_documento_url` | Get original PDF URL |

## Usage Instructions

The file `tecjustica-skill-analise-processual.md` contains the full prompt/skill for judicial process analysis. Load it as system instructions when using the MCP tools to analyze processes.

Key workflow:
1. Identify process by CNJ number, CPF/CNPJ, or legal theme
2. Use `pdpj_visao_geral_processo` as the first step for any CNJ number
3. Never paginate automatically — always ask the user first
4. List documents before reading them; only read what the user requests
