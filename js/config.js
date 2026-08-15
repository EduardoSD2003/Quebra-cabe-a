// ====== CONFIGURAÇÃO DO SUPABASE (gratuito) ======
// 1. Crie uma conta grátis em https://supabase.com
// 2. Crie um novo projeto (grátis, sem cartão)
// 3. Vá em "Project Settings" -> "API" e copie:
//    - "Project URL"       -> cole em SUPABASE_URL
//    - "anon public" key   -> cole em SUPABASE_ANON_KEY
// 4. Rode o conteúdo de supabase-schema.sql no "SQL Editor" do projeto
// Veja o README.md para o passo a passo completo.

const SUPABASE_URL = 'https://qkgueeehsherudchqvyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrZ3VlZWVoc2hlcnVkY2hxdnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODc3NTUsImV4cCI6MjEwMjM2Mzc1NX0.JEb-pQmXG__pyRlHu1kv8l4AEbboRhSciNy9y0Ncv1c';

function isSupabaseConfigured() {
  return SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('COLE_AQUI') && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
}

function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
