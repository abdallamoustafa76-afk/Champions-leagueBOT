// /cl-einrichten alles: Rollen, Kanäle erkennen/anlegen, Rechte, Wochenplan, Panels – in einem Rutsch.
import { get, mutate, getConfig } from "./store.mjs";
import { discord, getRoles, createRole } from "./discord.mjs";
import { GROUP_NAMES, ROUND_ROLES, DAYS, CHANNEL_TYPES } from "./data.mjs";
import { parseTime, toMinutes } from "./time.mjs";

const G = () => process.env.DISCORD_GUILD_ID;
const P = { VIEW: 1n << 10n, SEND: 1n << 11n, EMBED: 1n << 14n, FILES: 1n << 15n, HISTORY: 1n << 16n };
const bits = (...xs) => xs.reduce((a, b) => a | b, 0n).toString();

const fancy = (s) => [...s].map((ch) => { const c = ch.charCodeAt(0); return c >= 65 && c <= 90 ? String.fromCodePoint(0x1d4d0 + c - 65) : c >= 97 && c <= 122 ? String.fromCodePoint(0x1d4ea + c - 97) : ch; }).join("");

/** Kanal-Plan: Schlüssel, Name beim Anlegen, Kategorie, Rechte-Profil */
const PLAN = [
  { key: "welcome", name: "👋・" + fancy("Willkommen"), cat: "info", prof: "public" },
  { key: "rules", name: "📜・" + fancy("Regelwerk"), cat: "info", prof: "public" },
  { key: "roles", name: "🎭・" + fancy("Rollenauswahl"), cat: "info", prof: "public" },
  { key: "notify", name: "🔔・" + fancy("Benachrichtigungen"), cat: "info", prof: "public" },
  { key: "reg", name: "📝・" + fancy("Team-registrieren"), cat: "teams", prof: "managers" },
  { key: "team", name: "🛡️・" + fancy("Meine-Mannschaft"), cat: "teams", prof: "managers" },
  { key: "over", name: "📋・" + fancy("Mannschaftsuebersicht"), cat: "teams", prof: "public" },
  ...DAYS.map((d, i) => ({ key: "day" + (i + 1), name: "🗓️・" + fancy(d), cat: "cl", prof: "public", day: i + 1 })),
  { key: "live", name: "📺・" + fancy("Live-Spielplan"), cat: "cl", prof: "public" },
  { key: "hof", name: "🏆・" + fancy("Hall-of-Fame"), cat: "cl", prof: "public" },
  { key: "ban", name: "🚫・" + fancy("Sperrliste"), cat: "cl", prof: "public" },
  { key: "log", name: "📢・" + fancy("Turnierleitung"), cat: "cl", prof: "staff" },
  ...GROUP_NAMES.flatMap((g) => [
    { key: "g" + g, name: "⚽・" + fancy("Gruppe-" + g), cat: "groups", prof: "group:" + g },
    { key: "r" + g, name: "📋・" + fancy(g + "-Ergebnisse"), cat: "groups", prof: "groupres:" + g },
  ]),
  { key: "ko", name: "⚔️・" + fancy("KO-Phase"), cat: "ko", prof: "ko" },
  { key: "kor", name: "📋・" + fancy("KO-Ergebnisse"), cat: "ko", prof: "kores" },
];
const CATS = { info: "📌 INFO", teams: "👕 MANNSCHAFTEN", cl: "⭐ CHAMPIONS LEAGUE", groups: "⚽ GRUPPEN", ko: "⚔️ K.-O.-PHASE" };

/** Kanalname → Schlüssel (funktioniert auch mit Schreibschrift, Emojis und Trennzeichen) */
export function detectKey(rawName) {
  const n = rawName.normalize("NFKC").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
  let m;
  if ((m = n.match(/^gruppe([a-h])ergebnisse$/)) || (m = n.match(/^([a-h])ergebnisse$/))) return "r" + m[1].toUpperCase();
  if ((m = n.match(/^gruppe([a-h])$/))) return "g" + m[1].toUpperCase();
  if (n.includes("koergebnisse")) return "kor";
  if (n.includes("kophase")) return "ko";
  const day = DAYS.findIndex((d) => n === d.toLowerCase());
  if (day >= 0) return "day" + (day + 1);
  const map = [["willkommen", "welcome"], ["rollenauswahl", "roles"], ["benachrichtigung", "notify"], ["regelwerk", "rules"], ["registrieren", "reg"], ["meinemannschaft", "team"], ["mannschaftsuebersicht", "over"], ["livespielplan", "live"], ["halloffame", "hof"], ["sperrliste", "ban"], ["turnierleitung", "log"]];
  for (const [kw, key] of map) if (n.includes(kw)) return key;
  if (n === "regeln") return "rules";
  return null;
}

/** Rechte je Profil (Bot ist Admin und sieht ohnehin alles) */
function overwrites(prof, roles) {
  const everyone = G();
  const ro = { id: everyone, type: 0, allow: bits(P.VIEW, P.HISTORY), deny: bits(P.SEND) };
  const hide = { id: everyone, type: 0, allow: "0", deny: bits(P.VIEW) };
  const see = (id, ...extra) => (id ? { id, type: 0, allow: bits(P.VIEW, P.HISTORY, ...extra), deny: "0" } : null);
  const seeRO = (id) => (id ? { id, type: 0, allow: bits(P.VIEW, P.HISTORY), deny: bits(P.SEND) } : null);
  const lead = see(roles.turnierleitung, P.SEND, P.FILES);
  if (prof === "public") return [ro];
  if (prof === "managers") return [hide, seeRO(roles.manager), lead].filter(Boolean);
  if (prof === "staff") return [hide, lead, see(roles.moderator, P.SEND)].filter(Boolean);
  if (prof.startsWith("group:")) return [hide, see(roles.groups?.[prof.slice(6)], P.SEND), lead].filter(Boolean);
  if (prof.startsWith("groupres:")) return [hide, see(roles.groups?.[prof.slice(9)], P.SEND, P.FILES), lead].filter(Boolean);
  if (prof === "ko") return [hide, ...ROUND_ROLES.map((r) => see(roles.rounds?.[r], P.SEND)), lead].filter(Boolean);
  if (prof === "kores") return [hide, ...ROUND_ROLES.map((r) => see(roles.rounds?.[r], P.SEND, P.FILES)), lead].filter(Boolean);
  return [];
}

/** Rollen verknüpfen bzw. anlegen */
export async function setupRoles() {
  const existing = (await getRoles()) || [];
  const find = async (n, color) => { const r = existing.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (r) return r.id; const c = await createRole(n, color); return c?.id ?? null; };
  const roles = { turnierleitung: await find("Turnierleitung", 0xc9a227), moderator: await find("Moderator", 0xe67e22), manager: await find("Manager", 0x2f6fdc), spieler: await find("Spieler", 0x4a8a5c), groups: {}, rounds: {} };
  for (const g of GROUP_NAMES) roles.groups[g] = await find(`Gruppe ${g}`, 0x3ba55c);
  const rc = { Achtelfinale: 0x3c9ad6, Viertelfinale: 0x5865f2, Halbfinale: 0x9b59b6, Finale: 0xc9a227, "Spiel um Platz 3": 0xb5763a };
  for (const r of ROUND_ROLES) roles.rounds[r] = await find(r, rc[r]);
  await mutate("config", (c) => { c.roles = roles; }, { initial: { channels: {}, roles: {} } });
  return roles;
}

/** Hauptfunktion: plant alles und stellt die Aufträge in die Warteschlange */
export async function setupAll({ create = true, perms = true, kickoff = "20:00" } = {}) {
  const roles = await setupRoles();
  const all = (await discord(`/guilds/${G()}/channels`)) || [];
  const text = all.filter((c) => c.type === 0 || c.type === 5);
  const found = {};
  for (const c of text) { const k = detectKey(c.name); if (k && !found[k]) found[k] = c.id; }

  // Gefundene Kanäle sofort verknüpfen
  await mutate("config", (cfg) => {
    cfg.channels = cfg.channels || {};
    for (const [k, id] of Object.entries(found)) if (!k.startsWith("day")) cfg.channels[k] = id;
  }, { initial: { channels: {}, roles: {} } });

  const jobs = [];
  const missing = PLAN.filter((p) => !found[p.key]);
  if (create && missing.length) {
    const cats = all.filter((c) => c.type === 4);
    for (const catKey of [...new Set(missing.map((m) => m.cat))]) {
      const existing = cats.find((c) => c.name.normalize("NFKC").toLowerCase() === CATS[catKey].normalize("NFKC").toLowerCase());
      jobs.push(existing ? { k: "catknown", cat: catKey, id: existing.id } : { k: "cat", cat: catKey, name: CATS[catKey] });
    }
    for (const m of missing) jobs.push({ k: "chan", key: m.key, name: m.name, cat: m.cat, prof: m.prof, day: m.day });
  }
  if (perms) for (const p of PLAN) if (found[p.key]) jobs.push({ k: "perm", ch: found[p.key], prof: p.prof });
  // Wochenplan für gefundene Tageskanäle
  const ko = parseTime(kickoff) || "20:00";
  for (const p of PLAN.filter((x) => x.day && found[x.key])) jobs.push({ k: "zeit", day: p.day, ch: found[p.key], kickoff: ko });
  jobs.push({ k: "panels" });
  await mutate("setupjobs", (q) => { q.list = jobs; q.kickoff = ko; q.cats = {}; q.done = 0; q.total = jobs.length; }, { initial: {} });
  return { roles, found, missing: create ? missing : [], perms, total: jobs.length };
}

/** Aufträge abarbeiten (vom Befehl und danach jede Minute vom Timer) */
export async function processSetupJobs(budgetMs = 8000) {
  const deadline = Date.now() + budgetMs;
  const { refreshRulesPanel, refreshRolesPanel, refreshRegPanel, refreshTeamPanel, refreshOverview } = await import("./flow.mjs");
  const { refreshBanPanel } = await import("./bans.mjs");
  while (Date.now() < deadline - 1500) {
    const q = await get("setupjobs");
    const job = q?.list?.[0];
    if (!job) return;
    const cfg = await getConfig();
    let ok = true;
    if (job.k === "catknown") await mutate("setupjobs", (x) => { x.cats[job.cat] = job.id; });
    if (job.k === "cat") {
      const c = await discord(`/guilds/${G()}/channels`, "POST", { name: job.name, type: 4 });
      ok = !!c; if (c) await mutate("setupjobs", (x) => { x.cats[job.cat] = c.id; });
    }
    if (job.k === "chan") {
      const c = await discord(`/guilds/${G()}/channels`, "POST", { name: job.name, type: 0, parent_id: q.cats?.[job.cat] || undefined, permission_overwrites: overwrites(job.prof, cfg.roles || {}) });
      ok = !!c;
      if (c && !job.day) await mutate("config", (x) => { x.channels[job.key] = c.id; });
      if (c && job.day) await setDay(job.day, c.id, q.kickoff || "20:00");
    }
    if (job.k === "perm") {
      for (const o of overwrites(job.prof, cfg.roles || {})) {
        const r = await discord(`/channels/${job.ch}/permissions/${o.id}`, "PUT", { type: o.type, allow: o.allow, deny: o.deny });
        if (!r) ok = false;
      }
    }
    if (job.k === "zeit") await setDay(job.day, job.ch, job.kickoff);
    if (job.k === "panels") {
      await refreshRulesPanel(); await refreshRolesPanel(); await refreshRegPanel(); await refreshTeamPanel(); await refreshOverview(); await refreshBanPanel();
    }
    await mutate("setupjobs", (x) => {
      const j = x.list[0];
      if (!j) return;
      j.tries = (j.tries || 0) + 1;
      if (ok || j.tries >= 3) { x.list.shift(); x.done = (x.done || 0) + 1; }
      else x.list.push(x.list.shift());
    });
  }
}

async function setDay(day, ch, kickoff) {
  const k = parseTime(kickoff) || "20:00";
  const post = toMinutes(k) - 60 > toMinutes("12:00") ? "12:00" : "08:00";
  await mutate("zeitplan", (p) => { const old = p[day]; p[day] = { channelId: ch, kickoff: k, post, name: "Champions League", lastPosted: old?.channelId === ch ? old.lastPosted ?? null : null }; }, { initial: {} });
}

export async function setupProgress() {
  const q = await get("setupjobs");
  return q ? { done: q.done || 0, total: q.total || 0, left: q.list?.length || 0 } : null;
}

export { PLAN, CHANNEL_TYPES };
