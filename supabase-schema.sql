-- Execute este script inteiro no SQL Editor do seu projeto Supabase (gratuito).
-- Ele cria a tabela que guarda cada "sala" de quebra-cabeça: a imagem, a
-- configuração (linhas/colunas) e a posição atual de cada peça.

create table if not exists public.rooms (
  id text primary key,
  image text not null,
  rows integer not null,
  cols integer not null,
  board_w numeric not null,
  board_h numeric not null,
  seed bigint not null,
  pieces jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

-- Sem login: qualquer pessoa que tenha o código da sala (link) pode ler e
-- atualizar aquela sala. É o mesmo modelo de "link secreto" usado por sites
-- como Google Docs ou Jigsaw Planet para compartilhamento casual.
create policy "qualquer um pode ler salas" on public.rooms
  for select using (true);

create policy "qualquer um pode criar salas" on public.rooms
  for insert with check (true);

create policy "qualquer um pode atualizar salas" on public.rooms
  for update using (true);

-- Não é necessário mexer em "Replication"/publications: a sincronização ao
-- vivo do jogo usa canais de Broadcast + Presence do Supabase Realtime, que
-- já vêm habilitados por padrão em todo projeto novo.
