// Roda no PC pelo Agendador de Tarefas (a cada 5 min, 7h-15h): pega o cardapio do dia que o bot do Telegram
// grava em MENU_DIARIO/05_ENTREGAVEIS, converte para JPEG e agenda como story do Villa na hora.
// O robo do GitHub publica na rodada seguinte (ate ~15 min).
// uso: node scripts/cardapio.mjs [--teste]   (--teste so mostra o que faria)
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { ROOT, schedule, writeJson } from "./lib.mjs";

const PASTA = "D:/_CLIENTES/VILLA-PALHANO/MENU_DIARIO/05_ENTREGAVEIS";
const FFMPEG = "C:/ffmpeg/bin/ffmpeg.exe";
const ESPERA_MIN = 5; // se o cardapio for reenviado ao bot sai outro PNG logo depois: espera o ultimo do dia assentar
const VALIDADE_H = 3; // cardapio nao sai atrasado (ex.: chave fora do ar ate a tarde)
const teste = process.argv.includes("--teste");
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const agora = new Date();
const hoje = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// cardapio_AAAA-MM-DD_HHMMSS.png: o nome ordena por hora, vale sempre o mais recente do dia
const arqs = fs.readdirSync(PASTA).filter((f) => f.startsWith(`cardapio_${hoje}_`) && f.endsWith(".png")).sort();
if (!arqs.length) process.exit(0);
const ultimo = arqs.at(-1);
const src = path.join(PASTA, ultimo);
if (Date.now() - fs.statSync(src).mtimeMs < ESPERA_MIN * 6e4) {
  log(`${ultimo}: esperando ${ESPERA_MIN} min sem versao nova`);
  process.exit(0);
}

const id = `cardapio-${hoje}`;
const ja = schedule().find((p) => p.client === "villa" && p.id === id);
if (ja && (ja.status !== "pending" || ja.origem === ultimo)) process.exit(0); // ja agendado ou publicado

if (teste) {
  log(`[teste] agendaria ${id} (${ultimo}) como story do Villa as ${hora}${ja ? `, no lugar de ${ja.origem}` : ""}`);
  process.exit(0);
}

git("pull", "-q", "--rebase", "--autostash");
const sched = schedule();
const media = `media/villa/${id}.jpg`;
fs.mkdirSync(path.join(ROOT, "media", "villa"), { recursive: true });
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", src, "-q:v", "2", path.join(ROOT, media)]); // a API so aceita JPEG
const entry = { id, client: "villa", tipo: "story", at: `${hoje}T${hora}:00-03:00`, media, caption: "", origem: ultimo, validade_h: VALIDADE_H, status: "pending", tries: 0 };
const i = sched.findIndex((p) => p.client === "villa" && p.id === id);
if (i >= 0) sched[i] = entry; // versao nova antes de publicar: troca
else sched.push(entry);
sched.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
writeJson("schedule.json", sched);

git("add", "schedule.json", media);
git("commit", "-q", "-m", `Cardapio do dia ${hoje.split("-").reverse().join("/")} (story do Villa)`);
try {
  git("push", "-q");
} catch {
  git("pull", "-q", "--rebase", "--autostash"); // o robo pode ter salvo status no meio
  git("push", "-q");
}
log(`${id}: ${ultimo} agendado como story as ${hora}`);
