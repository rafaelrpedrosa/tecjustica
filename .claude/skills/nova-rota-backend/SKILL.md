---
name: nova-rota-backend
description: Adiciona nova rota Express ao backend-server.js seguindo os padrões do projeto RPAtec
user-invocable: false
---

Ao adicionar uma nova rota ao `backend-server.js`, siga rigorosamente estes padrões:

## Checklist obrigatório

1. **Rate limiter**: escolha o correto para a rota:
   - `generalLimiter` — rotas CRUD comuns (`/api/escritorio/*`, `/api/diligencias/*`)
   - `mcpLimiter` — rotas que chamam MCP ou processam documentos
   - `pdfLimiter` — rotas que servem ou processam PDFs

2. **Prefixo `/api/`**: todo path deve começar com `/api/`. Sem isso, o frontend não encontra a rota (silent 404).

3. **Tratamento de erro Supabase** — nunca expor `error.message` ao cliente:
   ```js
   if (error) {
     console.error('Contexto da rota:', error.message)
     return res.status(500).json({ error: 'Erro interno ao processar operação.' })
   }
   ```

4. **CORS**: se adicionar novo método HTTP (ex: PATCH), incluir no array `methods` da config CORS no topo do arquivo.

5. **Reiniciar o backend**: `backend-server.js` não tem hot-reload. Após adicionar a rota, lembrar o usuário de reiniciar o servidor — novas rotas retornam 404 até reiniciar.

6. **Service correspondente**: se a rota for nova feature, criar `src/services/<nome>.service.ts` com a chamada ao `apiClient` (prefixo `/api/` nos paths).

7. **Supabase grants**: se criar nova tabela junto com a rota, rodar após migration:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON <tabela> TO anon, authenticated, service_role;
   ```

## Template de rota

```js
app.get('/api/<recurso>', generalLimiter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('<tabela>')
      .select('*')

    if (error) {
      console.error('Erro ao buscar <recurso>:', error.message)
      return res.status(500).json({ error: 'Erro interno ao processar operação.' })
    }

    res.json(data)
  } catch (err) {
    console.error('Erro inesperado em <recurso>:', err.message)
    res.status(500).json({ error: 'Erro interno ao processar operação.' })
  }
})
```
