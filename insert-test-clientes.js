#!/usr/bin/env node
/**
 * Insert test clients into Supabase
 * Usage: SUPABASE_SERVICE_KEY="..." node insert-test-clientes.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtvojfqjtwfwcvqocadk.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_KEY não configurada.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const testClientes = [
  {
    nome: 'João Silva',
    cpfCnpj: '123.456.789-00',
    whatsapp: '(11) 98765-4321',
    email: 'joao@example.com',
    notas: 'Cliente de teste - Ativo',
  },
  {
    nome: 'Maria Santos',
    cpfCnpj: '987.654.321-00',
    whatsapp: '(21) 99876-5432',
    email: 'maria@example.com',
    notas: 'Cliente de teste - Passivo',
  },
  {
    nome: 'Empresa XYZ Ltda',
    cpfCnpj: '12.345.678/0001-90',
    whatsapp: '(31) 3333-4444',
    email: 'contato@empresa.com.br',
    notas: 'Cliente jurídico de teste',
  },
];

async function insertTestClientes() {
  console.log('🔄 Inserindo clientes de teste...\n');

  for (const cliente of testClientes) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([cliente])
        .select();

      if (error) {
        console.error(`❌ Erro ao inserir ${cliente.nome}:`, error.message);
      } else {
        console.log(`✅ ${cliente.nome} inserido (ID: ${data[0]?.id})`);
      }
    } catch (err) {
      console.error(`❌ Exceção: ${cliente.nome}:`, err.message);
    }
  }

  console.log('\n✅ Inserção concluída!');
  console.log('📋 Verificando clientes...\n');

  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, cpfCnpj, email')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro:', error.message);
    } else {
      console.log(`Total no banco: ${data?.length || 0}\n`);
      data?.forEach((c, i) => {
        console.log(`${i + 1}. ${c.nome} (${c.cpfCnpj})`);
      });
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }

  process.exit(0);
}

insertTestClientes().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
