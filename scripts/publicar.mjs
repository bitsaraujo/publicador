// Roda no GitHub Actions a cada 15 min: publica os posts vencidos do schedule.json e renova as chaves.
// MODO=verificar so confere se cada chave funciona (usar depois de cadastrar os Secrets).
import fs from "fs";
import path from "path";
import { ROOT, clients, schedule, writeJson, loadTokens, saveTokens, igGet, igPost, sleep } from "./lib.mjs";

const MAX_POR_RODADA = 6;
const MAX_TENTATIVAS = 3;
const RENOVAR_APOS_DIAS = 7; // a chave dura 60 dias; renovar toda semana sobra folga

// Os arquivos de midia sao servidos pelo GitHub Pages do proprio repo (a Meta baixa por link publico)
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "/").split("/");
const PAGES = process.env.PAGES_URL || `https://${owner.toLowerCase()}.github.io/${repo}/`;

const cl = clients();
const tokens = loadTokens();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (process.env.MODO === "verificar") {
  for (const [id, c] of Object.entries(cl)) {
    if (!tokens[id]) {
      log(`${id}: SEM CHAVE (secret ${c.secret} vazio)`);
      continue;
    }
    try {
      const me = await igGet("me", { fields: "user_id,username,account_type" }, tokens[id].token);
      const ok = me.username === c.instagram;
      log(`${id}: ${ok ? "OK" : "CONTA ERRADA"} -> @${me.username} (${me.account_type})`);
    } catch (e) {
      log(`${id}: ERRO ${e.message}`);
    }
  }
  process.exit(0);
}

async function urlNoAr(url) {
  const r = await fetch(url, { method: "HEAD" }).catch(() => null);
  return r?.ok;
}

async function esperarProcessar(container, token) {
  // video leva de segundos a alguns minutos pra Meta processar
  for (let i = 0; i < 60; i++) {
    const s = await igGet(container, { fields: "status_code,status" }, token);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`processamento: ${s.status || s.status_code}`);
    await sleep(10_000);
  }
  throw new Error("processamento demorou mais de 10 min");
}

async function publicar(p) {
  const token = tokens[p.client]?.token;
  if (!token) throw new Error(`sem chave para ${p.client}`);
  const url = new URL(p.media, PAGES).href;
  if (!(await urlNoAr(url))) return "midia-fora";

  const caption = p.caption.slice(0, 2200);
  const params = p.media.endsWith(".mp4")
    ? { media_type: "REELS", video_url: url, caption, share_to_feed: "true" }
    : { image_url: url, caption }; // imagem precisa ser JPEG
  const { id: container } = await igPost("me/media", params, token);
  await esperarProcessar(container, token);
  const { id } = await igPost("me/media_publish", { creation_id: container }, token);
  const info = await igGet(id, { fields: "permalink" }, token).catch(() => ({}));
  Object.assign(p, { status: "posted", posted_at: new Date().toISOString(), ig_media_id: id, permalink: info.permalink || null, error: null });
  fs.rmSync(path.join(ROOT, p.media), { force: true }); // libera espaco no Pages (limite 1 GB)
  return "ok";
}

const sched = schedule();
const agora = Date.now();
const vencidos = sched
  .filter((p) => p.status === "pending" && Date.parse(p.at) <= agora)
  .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  .slice(0, MAX_POR_RODADA);

log(`${vencidos.length} post(s) vencido(s)`);
for (const p of vencidos) {
  try {
    const r = await publicar(p);
    log(`${p.client}/${p.id}: ${r === "ok" ? "PUBLICADO " + (p.permalink || p.ig_media_id) : "midia ainda nao esta no Pages, tento na proxima"}`);
  } catch (e) {
    p.tries = (p.tries || 0) + 1;
    p.error = e.message;
    if (p.tries >= MAX_TENTATIVAS) p.status = "error";
    log(`${p.client}/${p.id}: ERRO (${p.tries}/${MAX_TENTATIVAS}) ${e.message}`);
  }
}
writeJson("schedule.json", sched);

// renova as chaves com mais de 7 dias (a Meta so aceita renovar chave com 24h ou mais)
let mudou = false;
for (const [id, t] of Object.entries(tokens)) {
  const ultima = t.refreshed_at ? Date.parse(t.refreshed_at) : 0;
  if (agora - ultima < RENOVAR_APOS_DIAS * 864e5) continue;
  try {
    const r = await igGet("https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" }, t.token);
    tokens[id] = { token: r.access_token, refreshed_at: new Date().toISOString(), expires_in: r.expires_in, seed: process.env[cl[id].secret] || t.seed };
    mudou = true;
    log(`${id}: chave renovada (vale ${Math.round(r.expires_in / 86400)} dias)`);
  } catch (e) {
    log(`${id}: nao renovou a chave: ${e.message}`);
  }
}
if (mudou) saveTokens(tokens);
