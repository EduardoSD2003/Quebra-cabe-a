# Quebra-Cabeça Online

Monte quebra-cabeças com um amigo, em tempo real, a partir de qualquer foto.
Você envia uma imagem, o site transforma em peças, e quem tiver o link entra
na mesma sala e monta junto com você.

100% gratuito: o site (HTML/CSS/JS puro, sem servidor próprio) roda hospedado
no **GitHub Pages**, e a sincronização entre jogadores usa o **Supabase**
(banco de dados + tempo real), ambos com plano gratuito permanente e sem
cartão de crédito.

## Como funciona

- As peças do quebra-cabeça são geradas **no navegador**, recortando a
  imagem enviada (nenhum servidor de processamento de imagem é necessário).
- A imagem e a posição de cada peça ficam guardadas numa tabela do Supabase,
  identificada por um código de sala aleatório (o que vai na URL que você
  compartilha).
- Os movimentos de peças são transmitidos ao vivo entre os jogadores usando
  Supabase Realtime (broadcast + presence).

## Passo 1 — Criar o backend gratuito (Supabase)

1. Acesse **https://supabase.com** e crie uma conta grátis (dá pra usar login
   do GitHub).
2. Clique em **New Project**. Escolha um nome, uma senha para o banco
   (guarde, mas você não vai precisar dela no dia a dia) e a região mais
   próxima de você. Plano **Free**.
3. Espere o projeto terminar de ser criado (cerca de 1-2 minutos).
4. No menu lateral, abra **SQL Editor** → **New query**, cole todo o
   conteúdo do arquivo [`supabase-schema.sql`](supabase-schema.sql) deste
   projeto e clique em **Run**.
5. Vá em **Project Settings** (ícone de engrenagem) → **API**. Copie:
   - **Project URL**
   - **anon public** key (a chave pública, não a `service_role`)
6. Abra o arquivo [`js/config.js`](js/config.js) neste projeto e cole os dois
   valores:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

> A chave `anon public` é feita para ser usada no navegador — não é secreta
> como uma senha. A proteção da sala vem do código aleatório da sala em si
> (como um link "só quem tem acesso" do Google Docs).

## Passo 2 — Testar localmente (opcional, mas recomendado)

Com [Node.js](https://nodejs.org) instalado, na pasta do projeto rode:

```bash
node .claude/static-server.js
```

E abra `http://localhost:8080` no navegador. Teste criar uma sala com uma
foto e, em outra aba (ou pelo celular), entrar com o link/código gerado.

## Passo 3 — Publicar de graça (GitHub Pages)

1. Crie uma conta grátis em **https://github.com** se ainda não tiver.
2. Crie um repositório novo (pode ser público — o código do site não
   contém nada sensível; as fotos enviadas ficam no Supabase, não no
   GitHub).
3. Envie os arquivos deste projeto para o repositório:
   ```bash
   git init
   git add .
   git commit -m "Quebra-cabeça online"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
4. No GitHub, abra o repositório → **Settings** → **Pages**.
5. Em **Build and deployment** → **Source**, escolha **Deploy from a
   branch**. Em **Branch**, escolha `main` e pasta `/ (root)`. Salve.
6. Em 1-2 minutos o GitHub mostrará o link do site, algo como:
   `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`

Pronto — esse é o link que você acessa para criar salas, e é esse domínio
que seus amigos vão acessar também (o link de convite da sala já vem
completo, prontinho pra colar no WhatsApp).

## Limites do plano gratuito (importante saber)

- **Supabase Free**: projetos são pausados automaticamente após ~1 semana
  sem uso. Se isso acontecer, basta entrar no painel do Supabase e clicar em
  "Restore/Unpause" — não perde nada, só precisa "acordar" o projeto antes
  de jogar.
- Banco gratuito: 500 MB de armazenamento — dá para milhares de salas, já
  que cada imagem é comprimida para no máximo ~1100px antes de ser salva.
- **GitHub Pages**: gratuito e sem expiração para repositórios públicos.
- Sem custo em nenhuma etapa: nem para desenvolver, nem para hospedar, nem
  para jogar.

## Estrutura do projeto

```
index.html        Tela inicial (criar ou entrar em uma sala)
room.html          Tela do jogo (o tabuleiro)
css/style.css       Visual do site
js/config.js        Chaves do Supabase (você preenche)
js/piece-shapes.js  Geração do formato das peças (encaixes)
js/puzzle.js         Motor do quebra-cabeça (arrastar, encaixar, grupos)
js/sync.js           Sincronização multiplayer via Supabase Realtime
js/lobby.js          Lógica da tela inicial
js/room.js           Lógica da tela do jogo
supabase-schema.sql  Script para criar a tabela no Supabase
```

## Possíveis melhorias futuras

- Girar peças (hoje elas só se movem, não rotacionam).
- Bandeja/organizador de peças pelas bordas da imagem.
- Cronômetro e histórico de quebra-cabeças já montados.
- Limite de peças simultâneas para imagens muito grandes.
