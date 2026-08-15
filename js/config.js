// ====== CONFIGURAÇÃO DO SUPABASE (gratuito) ======
// 1. Crie uma conta grátis em https://supabase.com
// 2. Crie um novo projeto (grátis, sem cartão)
// 3. Vá em "Project Settings" -> "API" e copie:
//    - "Project URL"       -> cole em SUPABASE_URL
//    - "anon public" key   -> cole em SUPABASE_ANON_KEY
// 4. Rode o conteúdo de supabase-schema.sql no "SQL Editor" do projeto
// Veja o README.md para o passo a passo completo.

const SUPABASE_URL = 'COLE_AQUI_A_SUA_PROJECT_URL';
const SUPABASE_ANON_KEY = 'COLE_AQUI_A_SUA_ANON_KEY';

function isSupabaseConfigured() {
  return SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('COLE_AQUI') && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
}

function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
