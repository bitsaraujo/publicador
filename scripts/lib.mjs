// Funcoes comuns: arquivos do repo, chaves do Instagram (cifradas no repo) e chamadas a API.
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const API = "https://graph.instagram.com/v23.0";

export const readJson = (f, fallback) =>
  fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) : fallback;
export const writeJson = (f, data) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(data, null, 2) + "\n");

export const clients = () => readJson("clients.json", {});
export const schedule = () => readJson("schedule.json", []);

// ---- chaves ----
// A chave inicial de cada conta vem do Secret do GitHub (IG_TOKEN_*). Quando o robo renova,
// guarda a nova em tokens.enc (AES-256-GCM com TOKEN_KEY), porque Action nao consegue editar Secret.
const keyOf = () => {
  if (!process.env.TOKEN_KEY) throw new Error("falta o secret TOKEN_KEY");
  return crypto.createHash("sha256").update(process.env.TOKEN_KEY).digest();
};

export function loadTokens() {
  const out = {};
  for (const [id, c] of Object.entries(clients())) {
    if (process.env[c.secret]) out[id] = { token: process.env[c.secret], refreshed_at: null };
  }
  const f = path.join(ROOT, "tokens.enc");
  if (fs.existsSync(f)) {
    const [iv, tag, data] = fs.readFileSync(f, "utf8").trim().split(".").map((s) => Buffer.from(s, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", keyOf(), iv);
    d.setAuthTag(tag);
    const saved = JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8"));
    for (const [id, t] of Object.entries(saved)) {
      // Secret trocado na mao depois da ultima renovacao vale mais que o salvo
      if (out[id] && out[id].token !== t.seed) continue;
      out[id] = t;
    }
  }
  return out;
}

export function saveTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyOf(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(tokens), "utf8"), c.final()]);
  fs.writeFileSync(path.join(ROOT, "tokens.enc"), [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".") + "\n");
}

// ---- API do Instagram (login do Instagram, graph.instagram.com) ----
async function call(method, endpoint, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const url = endpoint.startsWith("http") ? `${endpoint}?${qs}` : `${API}/${endpoint}?${qs}`;
  const res = await fetch(url, { method });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${endpoint}: ${e.message || res.status} (code ${e.code ?? "?"}${e.error_subcode ? "/" + e.error_subcode : ""})`);
  }
  return json;
}
export const igGet = (endpoint, params, token) => call("GET", endpoint, params, token);
export const igPost = (endpoint, params, token) => call("POST", endpoint, params, token);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
