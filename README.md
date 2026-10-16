# Publicador

Robô que publica os Reels de Vila Palhano, ATP e Plugin Power no Instagram na data marcada.
Roda de graça no GitHub Actions a cada 15 min; não precisa de PC ligado nem VPS.

- `schedule.json`: o calendário (quem, quando, legenda, status).
- `media/<cliente>/`: os vídeos agendados. O GitHub Pages serve o link público que a Meta baixa.
  Depois de publicado, o robô apaga o vídeo para não estourar o limite de 1 GB do Pages.
- `index.html`: o calendário para ver no navegador (GitHub Pages do repo).
- `scripts/agendar.mjs`: roda no PC, pega posts prontos do `posts.json` de cada cliente.
- `scripts/publicar.mjs`: roda no GitHub, publica o que venceu e renova as chaves toda semana.

## Agendar

```
node scripts/agendar.mjs villa dd-mocaccino,dd-cappuccino --inicio 2026-10-28 --dias seg,qua,sex --hora 11:30
git add -A && git commit -m "agenda" && git pull --rebase && git push
```

Clientes: `villa`, `atp`, `plugin` (ver `clients.json`). Horário de Brasília.

## Configuração (uma vez)

1. App "Publicador Pedro" na Meta for Developers, caso de uso Instagram com as permissões
   `instagram_business_basic` e `instagram_business_content_publish`. As 3 contas são
   "Testador do Instagram" e aceitaram o convite (instagram.com → Configurações → Apps e sites).
2. Painel do app → Instagram → Configuração da API com login do Instagram → Gerar tokens → uma chave por conta.
3. No repositório do GitHub → Settings → Secrets and variables → Actions → New repository secret:
   `IG_TOKEN_VILLA`, `IG_TOKEN_ATP`, `IG_TOKEN_PLUGIN` (as chaves) e `TOKEN_KEY` (uma senha longa qualquer,
   usada para cifrar as chaves renovadas em `tokens.enc`).
4. Settings → Pages → Deploy from a branch → `main` / root.
5. Actions → publicar → Run workflow → modo `verificar`: tem que dar OK nas 3 contas.

Atenção: o repositório é público (precisa para o Pages grátis), então as legendas agendadas ficam visíveis lá
antes de sair no Instagram. As chaves nunca ficam visíveis: estão nos Secrets ou cifradas.
