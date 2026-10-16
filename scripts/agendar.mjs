// Roda no PC: pega posts prontos do posts.json do cliente, copia a midia pro repo e marca as datas.
// uso: node scripts/agendar.mjs <cliente> <id1,id2,...> [--inicio 2026-10-28] [--dias seg,qua,sex] [--hora 11:30] [--em "2026-10-16 15:45,..."]
//   ex: node scripts/agendar.mjs villa dd-mocaccino,dd-cappuccino --inicio 2026-10-28
// Depois: git add -A && git commit && git push (o robo publica sozinho na hora).
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { ROOT, clients, schedule, writeJson } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const [clientId, idsArg] = args;
const c = clients()[clientId];
if (!c || !idsArg) {
  console.error(`uso: node scripts/agendar.mjs <${Object.keys(clients()).join("|")}> <id1,id2,...> [--inicio AAAA-MM-DD] [--dias seg,qua,sex] [--hora 11:30]`);
  process.exit(1);
}

const DIAS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const dias = opt("dias", "seg,qua,sex").split(",").map((d) => DIAS[d]);
const hora = opt("hora", "11:30");
const inicio = opt("inicio", new Date(Date.now() + 864e5).toISOString().slice(0, 10));
const MAX_MB = 12; // acima disso comprime (a Meta recomprime de qualquer jeito)

const posts = JSON.parse(fs.readFileSync(c.posts, "utf8"));
const winPath = (p) => p.replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:/`);
const sched = schedule();

// proximos horarios livres desse cliente (horario de Brasilia, -03:00 o ano todo)
const ocupados = new Set(sched.filter((p) => p.client === clientId).map((p) => p.at.slice(0, 10)));
function* slots() {
  const d = new Date(`${inicio}T12:00:00Z`);
  for (;;) {
    const dia = d.toISOString().slice(0, 10);
    if (dias.includes(d.getUTCDay()) && !ocupados.has(dia)) yield `${dia}T${hora}:00-03:00`;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
// --em "2026-10-16 15:45,2026-10-16 17:45": horarios exatos, usados antes dos dias da semana
const exatos = (opt("em", "") || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => `${s.replace(" ", "T")}:00-03:00`);
const semanais = slots();
const proximo = { next: () => (exatos.length ? { value: exatos.shift() } : semanais.next()) };

function comprimir(src, dst) {
  // ffmpeg do Remotion que ja existe no projeto do cliente
  execFileSync("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-preset", "slow",
    "-b:v", "3500k", "-maxrate", "4000k", "-bufsize", "7000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", dst], { cwd: c.projeto, stdio: "inherit", shell: true });
}

// capa do Reel: quadro a 60% do video (o comeco das animacoes e branco/preto, o texto ja esta todo na tela)
function capaMs(file) {
  const out = execFileSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `"${file}"`],
    { cwd: c.projeto, shell: true, encoding: "utf8" });
  return Math.round(parseFloat(out) * 600);
}

const feitos = [];
for (const id of idsArg.split(",").map((s) => s.trim()).filter(Boolean)) {
  const post = posts.find((p) => p.id === id || p.comando === id);
  if (!post) throw new Error(`${id} nao existe em ${c.posts}`);
  if (sched.some((p) => p.client === clientId && p.id === post.id && p.status !== "error")) {
    console.log(`${id}: ja estava agendado, pulei`);
    continue;
  }
  const src = winPath(post.video);
  if (!fs.existsSync(src)) throw new Error(`video nao encontrado: ${src}`);
  const media = `media/${clientId}/${post.id}.mp4`;
  fs.mkdirSync(path.join(ROOT, "media", clientId), { recursive: true });
  const dst = path.join(ROOT, media);
  if (fs.statSync(src).size > MAX_MB * 2 ** 20) comprimir(src, dst);
  else fs.copyFileSync(src, dst);

  const at = proximo.next().value;
  ocupados.add(at.slice(0, 10));
  const caption = [post.legenda, post.hashtags].filter(Boolean).join("\n\n");
  sched.push({ id: post.id, client: clientId, at, media, caption, thumb_ms: capaMs(dst), status: "pending", tries: 0 });
  feitos.push(`${at.slice(0, 16).replace("T", " ")}  ${clientId}/${post.id}  (${(fs.statSync(dst).size / 2 ** 20).toFixed(1)} MB)`);
}

sched.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
writeJson("schedule.json", sched);
console.log(feitos.length ? `Agendados:\n${feitos.join("\n")}` : "Nada novo pra agendar.");
