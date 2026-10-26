import nacl from "tweetnacl";
import { get, set, mutate, getConfig, getClubs, tKey } from "../lib/store.mjs";
import { editOriginal, discord, sendMessage } from "../lib/discord.mjs";
import { enqueue, processQueue } from "../lib/roles.mjs";
import * as T from "../lib/tournament.mjs";
import * as V from "../lib/views.mjs";
import * as F from "../lib/flow.mjs";
import { CLUBS, LEAGUES, GROUP_NAMES, ROUND_ROLES, CHANNEL_TYPES, BASE_CHANNEL_TYPES, DAYS, COLOR, VIDEO_LIMIT, VIDEO_WINDOW_MIN, flagOf } from "../lib/data.mjs";
import * as B from "../lib/bans.mjs";
import { baseNameOf, nickFor, setNick } from "../lib/names.mjs";
import * as AS from "../lib/autosetup.mjs";
import * as EAF from "../lib/eaflow.mjs";
import * as SUP from "../lib/support.mjs";
import * as AU from "../lib/audit.mjs";
import { parseVienna, parseTime, toMinutes, nextOccurrence, dateKey, shortDate, todayKey, daysBetween, minutesToHHMM } from "../lib/time.mjs";

// ---------- Hilfen ----------
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const eph = (content, extra = {}) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra } });
const uidOf = (i) => i.member?.user?.id ?? i.user?.id;
const isEphemeralMsg = (i) => ((i.message?.flags ?? 0) & 64) === 64;
/** Antwort auf einen Button: im eigenen Fenster aktualisieren, sonst neues privates Fenster */
const reply = (i, payload) => (isEphemeralMsg(i) ? { type: 7, data: { allowed_mentions: { parse: [] }, ...payload } } : { type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, ...payload } });
const opts = (list = []) => Object.fromEntries(list.map((x) => [x.name, x.value]));
function modalValues(i) { const o = {}; for (const r of i.data.components ?? []) { const c = r.components?.[0] ?? r.component; if (c?.custom_id) o[c.custom_id] = c.value ?? ""; } return o; }

const hasRole = (i, id) => !!id && (i.member?.roles ?? []).includes(id);
function isAdmin(i, cfg) {
  if (hasRole(i, cfg.roles.turnierleitung) || hasRole(i, process.env.ADMIN_ROLE_ID)) return true;
  return (BigInt(i.member?.permissions ?? "0") & 8n) === 8n;
}
const isStaff = (i, cfg) => isAdmin(i, cfg) || hasRole(i, cfg.roles.moderator);
const banText = (b) => `ist bis <t:${Math.floor(b.until / 1000)}:F> gesperrt (${["Eingecheckt, aber nicht erschienen","Während laufendem Turnierbetrieb rausgegangen","Gruppen- oder K.-o.-Phase ohne Abmeldung verlassen","Beleidigungen, Respektlosigkeit oder unsportliches Verhalten","Sonstiger schwerer Regelverstoß"][b.reason]})`;

/** Längere Aktionen: Discord sofort antworten, im Hintergrund weiterarbeiten */
function background(i, context, work, { update = false } = {}) {
  const run = async () => { try { return await work(); } catch (e) { console.error(e); return `❌ ${e.message}`; } };
  if (typeof context?.waitUntil === "function") {
    context.waitUntil(run().then(async (content) => { if (content) await editOriginal(i, typeof content === "string" ? { content, embeds: [], components: [] } : content); await processQueue(4000); }));
    return update ? { type: 6 } : { type: 5, data: { flags: 64 } };
  }
  return run().then((content) => (update ? { type: 7, data: typeof content === "string" ? { content, embeds: [], components: [] } : content } : eph(typeof content === "string" ? content : "", typeof content === "string" ? {} : content)));
}
const later = (context, fn) => { const p = Promise.resolve().then(fn).catch((e) => console.error(e)); if (context?.waitUntil) context.waitUntil(p.then(() => processQueue(4000))); return p; };

async function resolveTournament(i) {
  const own = await get(tKey(i.channel_id));
  if (own && !["fertig", "abgesagt", "geloescht"].includes(own.status)) return own;
  const active = await F.activeTournament();
  if (active) return active;
  throw new Error("Gerade läuft kein Cup.");
}

// ---------- Einstieg ----------
export default async (req, context) => {
  const body = await req.text();
  const sig = req.headers.get("x-signature-ed25519"), time = req.headers.get("x-signature-timestamp");
  let ok = false;
  try { ok = !!sig && !!time && nacl.sign.detached.verify(Buffer.from(time + body), Buffer.from(sig, "hex"), Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex")); } catch {}
  if (!ok) return new Response("Ungültige Signatur", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 });
  // Protokoll für die Admins: Aktionen von Turnierleitung & Staff in den Admin-Kanal
  try {
    const text = auditEntry(i, await getConfig());
    if (text) { const p = AU.audit(uidOf(i), text, i.channel_id).catch((e) => console.error("Protokoll:", e)); if (context?.waitUntil) context.waitUntil(p); }
  } catch (e) { console.error("Protokoll:", e); }
  try {
    if (i.type === 2) return json(await command(i, context));
    if (i.type === 3) return json(await component(i, context));
    if (i.type === 5) return json(await modal(i, context));
    return json(eph("Unbekannte Aktion."));
  } catch (e) {
    console.error(e);
    return json(isEphemeralMsg(i) && i.type === 3 ? { type: 7, data: { content: `❌ ${e.message}` } } : eph(`❌ ${e.message}`));
  }
};
export const config = { path: "/api/interactions" };

// ---------- Protokoll ----------
function auditEntry(i, cfg) {
  if (i.type === 2) {
    const name = i.data.name;
    if (name === "cl-ergebnis") return null; // normale Spieler-Aktion
    const ok = name === "cl-bewerbung" ? SUP.isServerAdmin(i.member) : isAdmin(i, cfg);
    return ok ? `\`${AU.describeCommand(i.data)}\`` : null;
  }
  if (i.type !== 3 && i.type !== 5) return null;
  const id = i.data.custom_id || "";
  let ok = false;
  if (id.startsWith("ban_")) ok = isStaff(i, cfg);
  else if (id.startsWith("reset_ok:")) ok = isAdmin(i, cfg);
  else if (id.startsWith("tk_")) ok = SUP.isTicketStaff(i.member, cfg);
  else if (id.startsWith("ap_")) ok = SUP.isServerAdmin(i.member);
  return ok ? AU.describeComponent(i) : null;
}

// ---------- Slash-Befehle ----------
async function command(i, context) {
  const cfg = await getConfig();
  const name = i.data.name;
  if (name === "cl-ergebnis") return resultOpen(i);
  if (name === "cl-bewerbung") {
    if (!SUP.isServerAdmin(i.member)) return eph("Das dürfen nur Server-Admins.");
    const open = i.data.options[0].name === "öffnen";
    return background(i, context, async () => { await SUP.setApplicationsOpen(open); return open ? "✅ Bewerbungen sind jetzt **geöffnet**." : "🔒 Bewerbungen sind jetzt **geschlossen**."; });
  }
  if (!isAdmin(i, cfg)) return eph("Das darf nur die Turnierleitung.");
  if (name === "cl-einrichten") return setup(i, context, cfg);
  if (name === "cl-zeitplan") return schedule(i, context);
  if (name === "cl-turnier") return manualCup(i, context);
  if (name === "cl-admin") return admin(i, context, cfg);
  return eph("Unbekannter Befehl.");
}

async function setup(i, context, cfg) {
  const sub = i.data.options[0], o = opts(sub.options);
  o.kanal = o.kanal || i.channel_id; // ohne Auswahl: aktueller Kanal
  if (sub.name === "kanal") {
    await mutate("config", (c) => { c.channels = c.channels || {}; c.channels[o.typ] = o.kanal; }, { initial: { channels: {}, roles: { groups: {}, rounds: {} } } });
    return eph(`✅ **${CHANNEL_TYPES[o.typ]}** → <#${o.kanal}>`);
  }
  if (sub.name === "rechte") {
    return background(i, context, async () => {
      const n = await AS.setupPerms();
      if (!n) return "Es sind noch keine Kanäle verknüpft.";
      await AS.processSetupJobs(14000);
      const pr = await AS.setupProgress();
      return `🔒 **Rechte für ${n} Kanäle werden gesetzt.**\n• Willkommen, Regelwerk, Rollenauswahl: für **alle** sichtbar\n• Alle anderen Bot-Kanäle: erst mit Rolle **Spieler** oder **Manager** (Staff sieht alles)\n${pr?.left ? `⏳ Noch ${pr.left} offen – läuft im Hintergrund weiter (ca. 1 Minute).` : "✅ Fertig."}\n-# Deine eigenen Kanäle (z. B. Community) stellst du am besten über die Kategorie ein.`;
    });
  }
  if (sub.name === "alles") {
    return background(i, context, async () => {
      const r = await AS.setupAll({ create: o.fehlende_erstellen ?? true, perms: o.rechte_setzen ?? true, kickoff: o.anpfiff ?? "20:00" });
      await AS.processSetupJobs(14000);
      const pr = await AS.setupProgress();
      const name = (k) => (k.startsWith("day") ? DAYS[Number(k.slice(3)) - 1] : CHANNEL_TYPES[k] || k);
      const found = Object.keys(r.found);
      return [
        "✅ **Einrichtung gestartet**",
        `👥 Rollen verknüpft bzw. angelegt.`,
        `🔎 **${found.length} Kanäle erkannt:** ${found.map(name).join(", ") || "–"}`,
        r.missing.length ? `🆕 **${r.missing.length} Kanäle werden angelegt:** ${r.missing.map((m) => name(m.key)).join(", ")}` : "🆕 Keine fehlenden Kanäle.",
        r.perms ? "🔒 Rechte werden gesetzt (wer welchen Kanal sieht)." : "🔒 Rechte nicht verändert.",
        `🗓️ Wochenplan: neue Tageskanäle mit Anpfiff ${o.anpfiff ?? "20:00"} – schon eingestellte Tage bleiben unverändert.`,
        "",
        pr?.left ? `⏳ **${pr.done}/${pr.total} erledigt** – der Rest läuft automatisch weiter (ca. 1–3 Minuten). Danach mit \`/cl-einrichten status\` prüfen.` : "🎉 **Alles erledigt!** Prüfen mit `/cl-einrichten status`.",
        "",
        "-# Wichtig: Die Rolle des Bots muss in der Rollenliste ganz oben stehen.",
      ].join("\n");
    });
  }
  if (sub.name === "zurücksetzen" && o.umfang === "stats") {
    return eph("⚠️ **Statistik zurücksetzen?**\nGelöscht werden: Medaillenspiegel, Top-Manager, Rekorde, letzte Sieger, alle persönlichen Statistiken sowie Titel- und Cup-Zähler der Vereine. Die Trophäenhalle startet wieder bei null.\nVereine, Manager, Sperren, Einrichtung und die Hall of Fame bleiben erhalten. Das kann nicht rückgängig gemacht werden.",
      { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "reset_no" }, { type: 2, style: 4, label: "Ja, Statistik zurücksetzen", custom_id: "reset_ok:stats" }] }] });
  }
  if (sub.name === "zurücksetzen") {
    const all = o.umfang === "all";
    return eph(all
      ? "⚠️ **Wirklich ALLES zurücksetzen?**\nGelöscht werden: Kanal- und Rollen-Verknüpfungen, Wochenplan, Panels **und** alle Vereine/Manager, Sperren, Regel-Bestätigungen, Turniere und Statistiken. Spitznamen werden zurückgesetzt.\nDeine Discord-Kanäle und -Rollen bleiben bestehen. Das kann nicht rückgängig gemacht werden."
      : "⚠️ **Einrichtung zurücksetzen?**\nGelöscht werden: Kanal- und Rollen-Verknüpfungen, Wochenplan und die Panel-Posts. Vereine, Sperren und Turniere bleiben erhalten.\nDeine Discord-Kanäle und -Rollen bleiben bestehen.",
      { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "reset_no" }, { type: 2, style: 4, label: all ? "Ja, alles zurücksetzen" : "Ja, Einrichtung zurücksetzen", custom_id: `reset_ok:${all ? "all" : "setup"}` }] }] });
  }
  if (sub.name === "gruppe") {
    const key = (o.art === "ergebnisse" ? "r" : "g") + o.gruppe;
    await mutate("config", (c) => { c.channels = c.channels || {}; c.channels[key] = o.kanal; }, { initial: { channels: {}, roles: { groups: {}, rounds: {} } } });
    return eph(`✅ **${CHANNEL_TYPES[key]}** → <#${o.kanal}>`);
  }
  if (sub.name === "rollen") {
    return background(i, context, async () => {
      const roles = await AS.setupRoles();
      const missing = [roles.turnierleitung, roles.moderator, roles.support, roles.manager, roles.spieler, ...Object.values(roles.groups), ...Object.values(roles.rounds), roles.koPhase].filter((x) => !x).length;
      return missing ? `⚠️ ${missing} Rollen konnten nicht angelegt werden – hat der Bot „Rollen verwalten“?` : "✅ Alle Rollen sind verknüpft (vorhandene übernommen, fehlende angelegt). Zieh die Rolle des Bots in der Rollenliste über alle diese Rollen.";
    });
  }
  if (sub.name === "panels") {
    return background(i, context, async () => { await F.refreshRulesPanel(); await F.refreshRolesPanel(); await F.refreshRegPanel(); await F.refreshTeamPanel(); await F.refreshOverview(); await B.refreshBanPanel(); await (await import("../lib/trophies.mjs")).refreshTrophyPanel(); await SUP.refreshTicketPanel(); await SUP.refreshApplyPanel(); return "✅ Panels in Regelwerk, Rollenauswahl, Trophäenhalle, Team-registrieren, Meine-Mannschaft, Mannschaftsübersicht, Sperrliste, Support und Staff-Bewerbung gepostet bzw. aktualisiert."; });
  }
  if (sub.name === "status") {
    const lines = Object.entries(CHANNEL_TYPES).map(([k, n]) => `${cfg.channels?.[k] ? "✅" : "▫️"} **${n}**${cfg.channels?.[k] ? ` → <#${cfg.channels[k]}>` : ""}`);
    const r = cfg.roles || {};
    const roleOk = r.manager && r.spieler && r.turnierleitung && GROUP_NAMES.every((g) => r.groups?.[g]) && ROUND_ROLES.every((x) => r.rounds?.[x]);
    const pr = await AS.setupProgress();
    const memOk = !!(await discord(`/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=1`));
    const memLine = memOk ? "**Mitgliederliste:** ✅ lesbar (Willkommen & Rollen-Abgleich laufen)" : "**Mitgliederliste:** ❌ nicht lesbar – im Discord Developer Portal unter *Bot* den **Server Members Intent** einschalten. Ohne den gibt es keine Willkommensnachrichten.";
    return eph(`${memLine}\n\n${pr?.left ? `⏳ **Einrichtung läuft noch:** ${pr.done}/${pr.total} erledigt\n\n` : ""}**Kanäle**\n${lines.join("\n")}\n\n**Rollen:** ${roleOk ? "✅ alle verknüpft" : "⚠️ noch nicht vollständig – `/cl-einrichten rollen`"}\n-# Gruppenkanäle brauchst du nur so viele, wie es Gruppen gibt (8 bei 32 Mannschaften).`);
  }
  return eph("Unbekannter Befehl.");
}

async function schedule(i, context) {
  const sub = i.data.options[0], o = opts(sub.options);
  o.kanal = o.kanal || i.channel_id; // ohne Auswahl: aktueller Kanal
  if (sub.name === "setzen") {
    const kickoff = parseTime(o.anpfiff), post = parseTime(o.posten ?? "12:00");
    if (!kickoff) return eph("Anpfiff bitte so angeben: `20:00`");
    if (!post) return eph("Posting-Zeit bitte so angeben: `12:00`");
    if (toMinutes(post) > toMinutes(kickoff) - 62) return eph(`Die Liste muss vor dem Anmeldeschluss (${minutesToHHMM(toMinutes(kickoff) - 60)}) gepostet werden.`);
    const entry = { channelId: o.kanal, kickoff, post, name: (o.name ?? "Champions League").trim() };
    await mutate("zeitplan", (p) => { const old = p[o.tag]; p[o.tag] = { ...entry, lastPosted: old?.channelId === o.kanal ? old.lastPosted ?? null : null }; }, { initial: {} });
    return eph(`✅ **${DAYS[o.tag - 1]}:** Liste um ${post} in <#${o.kanal}> · Anmeldeschluss & Auslosung ${minutesToHHMM(toMinutes(kickoff) - 60)} · Check-in-Ende ${minutesToHHMM(toMinutes(kickoff) - 5)} · Anpfiff ${kickoff}`);
  }
  if (sub.name === "anzeigen") {
    const p = (await get("zeitplan")) || {};
    return eph("🗓️ **Wochenplan** (Wiener Zeit)\n\n" + DAYS.map((d, k) => (p[k + 1] ? `**${d}** → <#${p[k + 1].channelId}> · Liste ${p[k + 1].post} · Anpfiff ${p[k + 1].kickoff}` : `**${d}** → –`)).join("\n"));
  }
  if (sub.name === "entfernen") {
    await mutate("zeitplan", (p) => { delete p[o.tag]; }, { initial: {} });
    return eph(`✅ ${DAYS[o.tag - 1]} entfernt.`);
  }
  if (sub.name === "jetzt-posten") {
    return background(i, context, async () => {
      const e = ((await get("zeitplan")) || {})[o.tag];
      if (!e) throw new Error(`Für ${DAYS[o.tag - 1]} ist nichts eingestellt.`);
      const n = nextOccurrence(o.tag, e.kickoff, 62 * 60000);
      if (!n) throw new Error("Kein passender Termin gefunden.");
      await F.launchTournament({ channelId: e.channelId, name: `${e.name} · ${DAYS[o.tag - 1]}, ${shortDate(n.mo, n.d)}`, day: DAYS[o.tag - 1], date: shortDate(n.mo, n.d), times: F.timesFromKickoff(n.ms) }, { replace: true });
      await mutate("zeitplan", (p) => { if (p[o.tag]) p[o.tag].lastPosted = dateKey(n.y, n.mo, n.d); }, { initial: {} });
      return `✅ Liste für ${DAYS[o.tag - 1]}, ${shortDate(n.mo, n.d)} in <#${e.channelId}> gepostet.`;
    });
  }
  return eph("Unbekannter Befehl.");
}

async function manualCup(i, context) {
  const o = opts(i.data.options);
  const kickoff = parseVienna(o.anpfiff);
  if (!kickoff) return eph("Anpfiff bitte so angeben: `31.10.2026 20:00`");
  if (kickoff - 60 * 60000 < Date.now() + 2 * 60000) return eph("Der Anmeldeschluss (60 Min. vor Anpfiff) muss in der Zukunft liegen.");
  return background(i, context, async () => {
    const t = await F.launchTournament({ channelId: i.channel_id, name: o.name.trim(), times: F.timesFromKickoff(kickoff) });
    return `✅ **${t.name}** ist erstellt.`;
  });
}

async function admin(i, context, cfg) {
  const sub = i.data.options[0], o = opts(sub.options);
  if (sub.name === "anmeldeschluss") return background(i, context, async () => { const t = await get(tKey(i.channel_id)); if (!t || t.status !== "anmeldung") throw new Error("In diesem Kanal ist keine Anmeldung offen."); await F.doDraw(i.channel_id); return "✅ Anmeldung geschlossen und ausgelost."; });
  if (sub.name === "checkin-ende") return background(i, context, async () => { const t = await resolveTournament(i); if (t.status !== "checkin") throw new Error("Es läuft gerade kein Check-in."); await F.doCheckinEnd(t.channelId); await F.doKickoff(t.channelId); if (t.test) await F.playVirtualMatches(t.channelId); return "✅ Check-in beendet – Spieltag 1 ist sofort freigegeben."; });
  if (sub.name === "spiele") {
    const t = await resolveTournament(i);
    const open = T.currentMatches(t).filter((m) => m.status !== "fertig");
    if (!open.length) return eph("Keine offenen Spiele.");
    return eph(open.map((m) => `${V.matchLine(m)}${Object.keys(m.reports).length ? `\n  ↳ ${Object.entries(m.reports).map(([c, r]) => `${V.esc(c)}: ${r.h}:${r.a}${r.pen ? ` (${r.pen.join(":")} i.E.)` : ""}`).join(" | ")}` : ""}`).join("\n").slice(0, 1900));
  }
  if (sub.name === "ergebnis") {
    return background(i, context, async () => {
      const pen = o.elfmeter ? T.parseScore(o.elfmeter) : null;
      if (o.elfmeter && !pen) throw new Error("Elfmeter bitte so angeben: `4:3`");
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => { const m = T.adminSet(t, o.spiel, o.heim, o.gast, pen); return { id: m.id, events: T.advance(t) }; });
      const m = t.matches.find((x) => x.id === result.id);
      await F.afterResult(t, m, result.events, true);
      return `✅ Spiel #${m.id} festgelegt: ${V.matchLine(m, false)}`;
    });
  }
  if (sub.name === "freilos-hinzufügen" || sub.name === "freilos-entfernen") {
    const add = sub.name === "freilos-hinzufügen";
    const { value: t, result: count } = await mutate(tKey(i.channel_id), (t) => (add ? T.addFreilos(t) : T.removeFreilos(t)), { missing: "In diesem Kanal gibt es gerade keine Anmeldung – bitte im Tageskanal benutzen." });
    later(context, () => F.refreshSignup(t));
    return eph(`🎟️ ${add ? "Freilos hinzugefügt" : "Freilos entfernt"} – jetzt ${count} ${count === 1 ? "Freilos" : "Freilose"} in der Liste.`);
  }
  if (sub.name === "abbrechen") return background(i, context, async () => { const t = await resolveTournament(i); await F.cancelTournament(t.channelId); return "✅ Turnier abgebrochen, Rollen werden entfernt."; });
  if (sub.name === "ea-verknüpfen") {
    return background(i, context, async () => {
      const name = CLUBS.find((c) => c.name.toLowerCase() === String(o.verein).trim().toLowerCase())?.name;
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Übersicht schreiben.");
      const id = o.ea_id ? String(o.ea_id).trim() : null;
      if (id && !/^\d{1,12}$/.test(id)) throw new Error("Die EA-Club-ID besteht nur aus Ziffern.");
      const r = await EAF.linkEaClub(name, { force: true, id });
      if (r.found) return `✅ ${flagOf(name)} **${V.esc(name)}** ist mit EA verknüpft${r.found.name ? ` → **${V.esc(r.found.name)}**` : ""} (ID ${r.found.id}).`;
      return r.err ? `⚠️ EA ist gerade nicht erreichbar (${r.err}). Später nochmal probieren oder die ID direkt angeben.` : `⚠️ Für ${flagOf(name)} **${V.esc(name)}** wurde bei EA kein eindeutiger Club gefunden. Namen prüfen oder die EA-Club-ID mit \`ea_id\` direkt eintragen.`;
    });
  }
  if (sub.name === "ea-status") {
    return background(i, context, async () => {
      const t = (await F.activeTournament()) || (await EAF.latestTournament(i.channel_id));
      if (!t) throw new Error("Es gibt noch kein Turnier.");
      return `🎮 **EA-Daten fürs TOTT · ${t.name}**${EAF.eaEnabled() ? "" : "\n⛔ Das TOTT ist ausgeschaltet (EA_AUTO=0)."}\n${await EAF.eaStatus(t)}`.slice(0, 1990);
    });
  }
  if (sub.name === "testcup-start") {
    return background(i, context, async () => {
      const size = Number(o.teams || 8);
      const r = await F.startTestCup(i.channel_id, uidOf(i), size);
      return `🧪 **Test-Cup erstellt** (${size} Teams).\n${r.mine ? `• Deine Mannschaft: ${flagOf(r.mine.club)} **${V.esc(r.mine.club)}** – du bekommst echte Gruppen- und KO-Rollen.` : "• ⚠️ Du hast keine eigene Mannschaft – registrier dich als Manager, damit du die Rollen mittesten kannst."}\n• ${r.virtual.length} Test-Teams (automatisch eingecheckt, spielen gegeneinander von selbst)\n\n**So geht's weiter:**\n1. \`/cl-admin anmeldeschluss\` → Auslosung\n2. Im Gruppenkanal einchecken, dann \`/cl-admin checkin-ende\`\n3. Deine Spiele über die Knöpfe melden (der Test-Gegner bestätigt nach 2 Min. automatisch) oder \`/cl-admin ergebnis\`\n4. \`/cl-admin testcup-weiter\` spielt die Test-Spiele sofort, sonst passiert es jede Minute von selbst\n5. \`/cl-admin rollen-check\` zum Prüfen der Rollen\n-# Keine Statistik, keine Trophäen, kein TOTT. Abbrechen: \`/cl-admin abbrechen\`.`;
    });
  }
  if (sub.name === "testcup-weiter") {
    return background(i, context, async () => {
      const t = await F.activeTournament();
      if (!t?.test) throw new Error("Gerade läuft kein Test-Cup (oder er ist noch nicht ausgelost).");
      const n = await F.playVirtualMatches(t.channelId);
      return n ? `🧪 ${n} Test-Spiele gespielt.` : "🧪 Gerade gibt es keine offenen Spiele zwischen Test-Teams – jetzt bist du dran (oder der Check-in läuft noch).";
    });
  }
  if (sub.name === "rollen-check") {
    return background(i, context, async () => {
      const { listMembers } = await import("../lib/discord.mjs");
      const M = await import("../lib/maintenance.mjs");
      const members = await listMembers();
      if (!members) return "❌ Ich kann die Mitgliederliste nicht lesen. Im Discord Developer Portal unter *Bot* den **Server Members Intent** einschalten – ohne den kann ich fehlende Rollen weder erkennen noch nachholen.";
      const r = await M.cupRoleDiff(members, { includePending: true });
      if (!r) return "Gerade läuft kein Cup mit Gruppen- oder K.-o.-Phase.";
      const q = (await get("rolequeue")) || [];
      const head = `🔎 **Rollen-Check · ${r.t.name}**\n📥 Warteschlange: **${q.length}** offene Rollen-Änderungen${q.length ? ` (nächster Versuch <t:${Math.ceil(Math.min(...q.map((o) => o.nextAt || Date.now())) / 1000)}:R>)` : ""}`;
      if (!r.missing.length) return `${head}\n✅ Alle Teilnehmer haben genau die richtigen Turnier-Rollen.`;
      const lines = r.missing.slice(0, 25).map((x) => x.gone
        ? `• <@${x.u}> (${V.esc(x.club || "?")}) – **nicht mehr auf dem Server**`
        : `• <@${x.u}> (${V.esc(x.club || "?")})${x.add.length ? ` fehlt: ${x.add.map((id) => `<@&${id}>`).join(" ")}` : ""}${x.rem.length ? ` zu viel: ${x.rem.map((id) => `<@&${id}>`).join(" ")}` : ""}${x.pending ? " ⏳" : ""}`);
      await enqueue(r.ops.map((o) => ({ ...o, why: "Rollen-Check" })));
      await processQueue(8000);
      return `${head}\n⚠️ **${r.missing.length} Abweichungen** – ich korrigiere sie jetzt:\n${lines.join("\n")}${r.missing.length > 25 ? `\n… und ${r.missing.length - 25} weitere` : ""}\n-# ⏳ = war schon in der Warteschlange. Führ den Check in 1–2 Minuten nochmal aus. Bleibt jemand übrig, steht die Bot-Rolle wahrscheinlich unter dieser Rolle (Servereinstellungen → Rollen → Bot-Rolle nach oben ziehen).`.slice(0, 1990);
    });
  }
  if (sub.name === "willkommen-test") {
    if (!cfg.channels.welcome) return eph("Der Willkommens-Kanal ist noch nicht verknüpft: `/cl-einrichten kanal typ: Willkommen`.");
    return background(i, context, async () => {
      const m = await sendMessage(cfg.channels.welcome, V.welcomePost(uidOf(i), cfg.channels));
      return m ? `✅ Test-Begrüßung in <#${cfg.channels.welcome}> gepostet.` : "❌ Ich konnte im Willkommens-Kanal nicht posten – fehlen dem Bot dort die Rechte „Nachrichten senden“ und „Links einbetten“?";
    });
  }
  if (sub.name === "tott") {
    return background(i, context, async () => {
      const t = await EAF.latestTournament(i.channel_id);
      if (!t) throw new Error("Es gibt noch kein Turnier mit Anpfiff.");
      const r = await EAF.postTott(t, { force: true });
      return r.posted ? `✅ TOTT für **${t.name}** in <#${r.channel}> gepostet.` : `⚠️ TOTT nicht gepostet: ${r.reason}.`;
    });
  }
  if (sub.name === "verein-freigeben") {
    return background(i, context, async () => {
      const name = CLUBS.find((c) => c.name.toLowerCase() === String(o.verein).trim().toLowerCase())?.name;
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Übersicht schreiben.");
      const r = await F.releaseClub(name, { reason: "Von der Turnierleitung freigegeben" });
      return r ? `✅ ${flagOf(name)} ${name} ist wieder frei.` : "Dieser Verein war gar nicht vergeben.";
    });
  }
  return eph("Unbekannter Befehl.");
}

// ---------- Ergebnis melden ----------
async function resultOpen(i) {
  const t = await resolveTournament(i);
  const mine = F.clubOfUser(await getClubs(), uidOf(i));
  if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
  const open = T.openMatchesOf(t, mine.club);
  if (!open.length) return eph("Deine Mannschaft hat gerade kein offenes Spiel.");
  if (open.length === 1) return V.resultModal(open[0], T.koRoundName(t));
  return { type: 4, data: { flags: 64, ...V.matchPicker(open) } };
}

// ---------- Buttons & Menüs ----------
async function component(i, context) {
  const cfg = await getConfig();
  const id = i.data.custom_id, uid = uidOf(i);

  // --- Support-Tickets ---
  if (id.startsWith("tk_")) return ticketComponent(i, context, cfg, id, uid);
  // --- Staff-Bewerbungen ---
  if (id.startsWith("ap_")) return applyComponent(i, context, id, uid);

  // --- Trophäenhalle ---
  if (id === "stats_me") return eph(await (await import("../lib/trophies.mjs")).myStats(uid));

  // --- Zurücksetzen ---
  if (id === "reset_no") return reply(i, { content: "Abgebrochen – nichts wurde verändert.", components: [] });
  if (id.startsWith("reset_ok:")) {
    if (!isAdmin(i, cfg)) return reply(i, { content: "Das darf nur die Turnierleitung.", components: [] });
    const scope = id.split(":")[1];
    return background(i, context, async () => {
      const r = await AS.resetBot(scope);
      if (scope === "stats") return "✅ **Statistik zurückgesetzt.** Die Trophäenhalle startet wieder bei null.";
      return `✅ **${scope === "all" ? "Alles" : "Einrichtung"} zurückgesetzt.** ${r.deleted} Panel-Posts gelöscht${scope === "all" ? `, ${r.nicks} Spitznamen zurückgesetzt` : ""}.\nNeu einrichten mit \`/cl-einrichten alles\`.`;
    }, { update: true });
  }

  // --- Rollenauswahl ---
  if (id === "role_player") {
    if (hasRole(i, cfg.roles.manager)) return eph("Du bist Manager – die Spieler-Rolle brauchst du nicht zusätzlich.");
    if (hasRole(i, cfg.roles.spieler)) {
      // Zweiter Klick: Rolle wieder entfernen
      await enqueue([{ u: uid, rem: [cfg.roles.spieler], why: "Rollenauswahl: Spieler abgewählt" }]);
      later(context, () => processQueue(3000));
      return eph("➖ Die Rolle **Spieler** wurde entfernt.\n-# Ohne Rolle siehst du nur noch Willkommen, Regelwerk und Rollenauswahl. Ein Klick auf „Spieler werden“ gibt sie dir zurück.");
    }
    await enqueue([{ u: uid, add: [cfg.roles.spieler], why: "Rollenauswahl: Spieler" }]);
    later(context, () => processQueue(3000));
    return eph("✅ Du hast jetzt die Rolle **Spieler**. Viel Spaß beim Champions League Cup!");
  }
  if (id === "role_manager") {
    if (hasRole(i, cfg.roles.manager)) {
      // Zweiter Klick: erst nachfragen, weil dabei der Verein abgegeben wird
      const mine = F.clubOfUser(await getClubs(), uid);
      const what = !mine ? "" : mine.role === "co"
        ? `\nDu bist dann nicht mehr Co-VM von ${flagOf(mine.club)} **${V.esc(mine.club)}**.`
        : mine.data.co ? `\nDein Verein ${flagOf(mine.club)} **${V.esc(mine.club)}** geht an deinen Co-VM <@${mine.data.co}>.` : `\n⚠️ Dein Verein ${flagOf(mine.club)} **${V.esc(mine.club)}** wird **frei** und kann von jemand anderem übernommen werden.`;
      return { type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, content: `**Manager-Rolle wirklich abgeben?**${what}\nDu bekommst stattdessen die Rolle **Spieler**.`, components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "role_manager_keep" }, { type: 2, style: 4, label: "Ja, abgeben", custom_id: "role_manager_off" }] }] } };
    }
    const b = await B.findBan([uid]);
    if (b) return eph(`❌ Du ${banText(b).replace(/^ist/, "bist")} und kannst gerade nicht Manager werden.`);
    await enqueue([{ u: uid, add: [cfg.roles.manager], rem: [cfg.roles.spieler], why: "Rollenauswahl: Manager" }]);
    later(context, () => processQueue(3000));
    return eph(`✅ Du bist jetzt **Manager**! Die Spieler-Rolle wurde entfernt.\nSuch dir jetzt deinen Verein aus${cfg.channels.reg ? ` in <#${cfg.channels.reg}>` : ""}.`);
  }

  if (id === "role_manager_keep") return reply(i, { content: "👍 Du bleibst Manager.", components: [] });
  if (id === "role_manager_off") {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Du bist kein Manager mehr.", components: [] });
    return background(i, context, async () => {
      const mine = F.clubOfUser(await getClubs(), uid);
      if (mine?.role === "manager") await F.releaseClub(mine.club, { transferToCo: true, reason: "Manager-Rolle abgegeben" });
      if (mine?.role === "co") {
        const orig = mine.data.coOrigNick ?? null;
        await mutate("clubs", (cl) => { if (cl[mine.club]?.co === uid) Object.assign(cl[mine.club], { co: null, coBase: null, coOrigNick: null }); }, { initial: {} });
        await setNick(uid, orig);
        await F.refreshOverview();
      }
      await enqueue([{ u: uid, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Rollenauswahl: Manager abgegeben" }]);
      await processQueue(3000);
      return `➖ Du bist kein Manager mehr${mine ? ` – ${mine.role === "co" ? "Co-VM-Platz" : "Verein"} abgegeben` : ""}. Du hast jetzt die Rolle **Spieler**.`;
    }, { update: true });
  }

  // --- Regelwerk ---
  if (id === "rules_ok") {
    if (await F.rulesAccepted(uid)) return eph("✅ Du hast das Regelwerk bereits akzeptiert.");
    await F.acceptRules(uid);
    later(context, F.refreshRulesPanel);
    return eph("✅ Danke! Du hast das Regelwerk akzeptiert und kannst dich jetzt zum Cup anmelden.");
  }

  // --- Registrierung ---
  if (id === "reg_start" || id.startsWith("reg_league:") || id.startsWith("reg_club:")) {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Mannschaften registrieren können nur Mitglieder mit der Rolle **Manager**." });
    const clubs = await getClubs();
    const mine = F.clubOfUser(clubs, uid);
    if (mine) return reply(i, { content: mine.role === "co" ? `Du bist Co-VM von **${V.esc(mine.club)}** und kannst keine eigene Mannschaft registrieren.` : `Du bist bereits Manager von ${flagOf(mine.club)} **${V.esc(mine.club)}**.`, components: [] });
    if (id === "reg_start") return reply(i, V.regLeagues(clubs));
    if (id.startsWith("reg_league:")) return reply(i, V.regClubs(clubs, Number(id.split(":")[1])));
    const idx = Number(id.split(":")[1]);
    if (clubs[CLUBS[idx].name]) return reply(i, { content: "Diese Mannschaft wurde gerade vergeben – wähl eine andere.", ...V.regClubs(clubs, CLUBS[idx].li) });
    return V.eaModal(`reg_ea:${idx}`, `${CLUBS[idx].name} übernehmen`.slice(0, 45));
  }

  // --- Meine Mannschaft ---
  if (id.startsWith("team_")) {
    const clubs = await getClubs();
    const mine = F.clubOfUser(clubs, uid);
    if (!mine) return reply(i, { content: hasRole(i, cfg.roles.manager) ? "Du hast noch keine Mannschaft – registriere dich in Team-registrieren." : "Das können nur Mitglieder mit der Rolle **Manager**.", embeds: [], components: [] });
    const detail = (c, note) => ({ ...V.teamDetail(c.club, c.data, c.role, daysBetween(c.data.lastPlayed || todayKey(), todayKey())), content: note || "" });
    if (id === "team_open") return reply(i, detail(mine));
    if (id === "team_ea") return V.eaModal("team_ea_m", "EA-Club ändern", mine.data.ea);
    if (mine.role === "co") {
      if (id === "team_co_quit") {
        const orig = mine.data.coOrigNick ?? null;
        await mutate("clubs", (cl) => { if (cl[mine.club]?.co === uid) Object.assign(cl[mine.club], { co: null, coBase: null, coOrigNick: null }); }, { initial: {} });
        await enqueue([{ u: uid, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Als Co-VM ausgetreten" }]);
        later(context, async () => { await setNick(uid, orig); await F.refreshOverview(); });
        return reply(i, { content: `Du bist als Co-VM von ${flagOf(mine.club)} **${V.esc(mine.club)}** ausgetreten.`, embeds: [], components: [] });
      }
      return reply(i, { content: "Das kann nur der Manager der Mannschaft.", embeds: [], components: [] });
    }
    if (id === "team_co_add") return reply(i, V.coSelect());
    if (id === "team_co_pick") {
      const target = i.data.values?.[0];
      const user = i.data.resolved?.users?.[target];
      if (!target || target === uid) return reply(i, { ...V.coSelect(), content: "Du kannst dich nicht selbst als Co-VM eintragen." });
      if (user?.bot) return reply(i, { ...V.coSelect(), content: "Bots können keine Co-VMs sein." });
      if (F.clubOfUser(clubs, target)) return reply(i, { ...V.coSelect(), content: "Dieses Mitglied gehört schon zu einer Mannschaft." });
      const tb = await B.findBan([target]);
      if (tb) return reply(i, { ...V.coSelect(), content: `<@${target}> ${banText(tb)} und kann gerade kein Co-VM werden.` });
      const tm = i.data.resolved?.members?.[target];
      const coBase = baseNameOf(tm, user);
      const { value } = await mutate("clubs", (cl) => { if (cl[mine.club]?.manager === uid) Object.assign(cl[mine.club], { co: target, coBase, coOrigNick: tm?.nick ?? null }); }, { initial: {} });
      await enqueue([{ u: target, add: [cfg.roles.manager], rem: [cfg.roles.spieler], why: `Co-VM von ${mine.club}` }]);
      later(context, async () => { await setNick(target, nickFor(coBase, "co", mine.club)); await F.refreshOverview(); });
      return reply(i, detail({ ...mine, data: value[mine.club] }, `✅ <@${target}> ist jetzt Co-VM – Rolle Manager vergeben, Rolle Spieler entfernt.`));
    }
    if (id === "team_co_rem") {
      const co = mine.data.co; if (!co) return reply(i, detail(mine));
      const orig = mine.data.coOrigNick ?? null;
      const { value } = await mutate("clubs", (cl) => { if (cl[mine.club]) Object.assign(cl[mine.club], { co: null, coBase: null, coOrigNick: null }); }, { initial: {} });
      await enqueue([{ u: co, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: `Co-VM von ${mine.club} entfernt` }]);
      later(context, async () => { await setNick(co, orig); await F.refreshOverview(); });
      return reply(i, detail({ ...mine, data: value[mine.club] }, "✅ Co-VM entfernt – Rolle Manager entfernt, Rolle Spieler wieder vergeben."));
    }
    const busy = async () => { for (const t of await F.allTournaments()) if (!["fertig", "abgesagt", "geloescht"].includes(t.status) && (t.reg.includes(mine.club) || t.playing.includes(mine.club))) return true; return false; };
    if (id === "team_leave") return reply(i, V.confirmView(mine.data.co ? `Mannschaft verlassen? <@${mine.data.co}> wird neuer Manager.` : `Mannschaft verlassen? ${V.esc(mine.club)} wird für alle frei.`, "team_leave_ok", "Verlassen"));
    if (id === "team_del") return reply(i, V.confirmView(`Mannschaft wirklich löschen? ${V.esc(mine.club)} wird für alle frei, und eure Statistiken werden gelöscht. Das kann nicht rückgängig gemacht werden.`, "team_del_ok", "Endgültig löschen"));
    if (id === "team_leave_ok" || id === "team_del_ok") {
      if (await busy()) return reply(i, { content: "Während eure Mannschaft für einen Cup angemeldet ist, geht das nicht. Meldet euch zuerst ab oder wartet bis nach dem Cup.", embeds: [], components: [] });
      later(context, () => F.releaseClub(mine.club, { transferToCo: id === "team_leave_ok", reason: id === "team_del_ok" ? "Mannschaft gelöscht" : "Manager hat die Mannschaft verlassen" }));
      return reply(i, { content: id === "team_del_ok" ? `Mannschaft gelöscht. ${V.esc(mine.club)} ist wieder frei.` : mine.data.co ? `Du hast die Mannschaft verlassen. <@${mine.data.co}> ist jetzt Manager.` : `Du hast die Mannschaft verlassen. ${V.esc(mine.club)} ist wieder frei.`, embeds: [], components: [] });
    }
  }

  // --- Anmeldeliste ---
  if (id === "cup_join" || id === "cup_leave" || id === "cup_waitci") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph(hasRole(i, cfg.roles.manager) ? "Du brauchst zuerst eine Mannschaft – registriere dich in Team-registrieren." : "Anmelden können nur Manager mit einer Mannschaft.");
    if (id !== "cup_leave") {
      const b = await B.findBan(F.membersOf(await getClubs(), mine.club));
      if (b) return eph(`❌ ${flagOf(mine.club)} **${V.esc(mine.club)}** kann sich nicht anmelden: <@${b.user}> ${banText(b)}.`);
    }
    if (id === "cup_join" && !(await F.rulesAccepted(uid))) return eph(`📜 Bitte akzeptiere zuerst das Regelwerk${cfg.channels.rules ? ` in <#${cfg.channels.rules}>` : ""} – danach kannst du deine Mannschaft anmelden.`);
    const { value: t, result } = await mutate(tKey(i.channel_id), (t) => {
      if (id === "cup_join") { const pos = T.register(t, mine.club); const f = T.fmtOf(t.reg.length); return f && pos > f ? `${flagOf(mine.club)} **${V.esc(mine.club)}** ist angemeldet – **Warteliste Platz ${pos - f}**.` : `${flagOf(mine.club)} **${V.esc(mine.club)}** ist angemeldet – Platz ${pos}.`; }
      if (id === "cup_leave") { T.unregister(t, mine.club); return "Deine Mannschaft wurde abgemeldet."; }
      const r = T.checkIn(t, mine.club); return r === "warteliste" ? "✅ Auf der Warteliste eingecheckt – du rückst nach, falls eine Mannschaft nicht eincheckt." : "✅ Eingecheckt.";
    }, { missing: "In diesem Kanal gibt es gerade keine Anmeldung." });
    later(context, () => F.refreshSignup(t));
    return eph(result);
  }

  // --- Check-in in der Gruppe ---
  if (id === "grp_ci") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const t0 = await resolveTournament(i);
    const { value: t } = await mutate(tKey(t0.channelId), (t) => T.checkIn(t, mine.club));
    later(context, () => F.refreshGroupCheckin(t, T.groupOf(t, mine.club)));
    return eph(`✅ ${flagOf(mine.club)} **${V.esc(mine.club)}** ist eingecheckt. Viel Erfolg!`);
  }

  // --- Sperrliste ---
  if (id.startsWith("ban_")) {
    if (!isStaff(i, cfg)) return reply(i, { content: "❌ Sperren können nur die **Turnierleitung** und **Mods**.", components: [] });
    if (id === "ban_start") return reply(i, V.banStep1());
    if (id === "ban_user") {
      const u = i.data.values?.[0];
      if (!u || i.data.resolved?.users?.[u]?.bot) return reply(i, { ...V.banStep1(), content: "Bitte eine echte Person auswählen." });
      return reply(i, V.banStep2(u));
    }
    if (id.startsWith("ban_r:")) return reply(i, V.banStep3(id.split(":")[1], Number(i.data.values[0])));
    if (id.startsWith("ban_d:")) {
      const [, u, r] = id.split(":");
      const mine = F.clubOfUser(await getClubs(), u);
      const partner = mine ? (mine.role === "manager" ? mine.data.co : mine.data.manager) : null;
      return reply(i, V.banStep4(u, Number(r), Number(i.data.values[0]), partner));
    }
    if (id.startsWith("ban_note:")) return V.banNoteModal(id.slice("ban_note:".length));
    if (id.startsWith("ban_ok:")) return doBan(i, context, id.slice("ban_ok:".length), "");
    if (id === "ban_lift") { const bans = await B.getActiveBans(); return reply(i, bans.length ? V.banLiftPicker(bans) : { content: "Aktuell ist niemand gesperrt.", components: [] }); }
    if (id === "ban_lift_pick") { const u = i.data.values[0]; later(context, () => B.lift(u, uid)); return reply(i, { content: `✅ Sperre von <@${u}> wird aufgehoben.`, components: [] }); }
  }

  // --- Größenvideo ---
  if (id === "vid_req") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    return V.videoMinuteModal(VIDEO_WINDOW_MIN);
  }

  // --- Ergebnis ---
  if (id === "res_open") return resultOpen(i);
  if (id.startsWith("res_ok:")) {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const matchId = Number(id.split(":")[1]);
    return background(i, context, async () => {
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => { T.confirmPending(t, matchId, mine.club); return T.advance(t); });
      const m = t.matches.find((x) => x.id === matchId);
      await F.afterResult(t, m, result);
      return `✅ Ergebnis bestätigt: ${V.matchLine(m, false)}`;
    });
  }
  if (id === "res_pick") {
    const t = await resolveTournament(i);
    const m = t.matches.find((x) => x.id === Number(i.data.values?.[0]));
    if (!m || m.status === "fertig") return reply(i, { content: "Dieses Spiel ist nicht mehr offen.", components: [] });
    return V.resultModal(m, T.koRoundName(t));
  }
  return eph("Unbekannter Button.");
}

// ---------- Formulare ----------
async function modal(i, context) {
  const cfg = await getConfig();
  const id = i.data.custom_id, uid = uidOf(i), v = modalValues(i);

  if (id.startsWith("reg_ea:")) {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Nur Mitglieder mit der Rolle **Manager** können registrieren.", components: [] });
    const c = CLUBS[Number(id.split(":")[1])];
    const ea = v.ea.trim();
    if (ea.length < 3) return reply(i, { content: "Der EA-Clubname braucht mindestens 3 Zeichen.", components: [] });
    const { result } = await mutate("clubs", (cl) => {
      if (F.clubOfUser(cl, uid)) return "schon";
      if (cl[c.name]) return "vergeben";
      cl[c.name] = { manager: uid, co: null, ea, since: Date.now(), lastPlayed: todayKey(), cups: 0, titles: 0, managerBase: baseNameOf(i.member), managerOrigNick: i.member?.nick ?? null };
      return "ok";
    }, { initial: {} });
    if (result === "vergeben") return reply(i, { content: `${c.name} wurde gerade vergeben – wähl eine andere Mannschaft.`, ...V.regClubs(await getClubs(), c.li) });
    if (result === "schon") return reply(i, { content: "Du hast bereits eine Mannschaft.", components: [] });
    later(context, async () => {
      await setNick(uid, nickFor(baseNameOf(i.member), "manager", c.name));
      await F.refreshRegPanel(); await F.refreshOverview();
      if (EAF.eaEnabled()) await EAF.linkEaClub(c.name, { force: true });
    });
    return reply(i, { content: `${c.flag} **Willkommen, Manager von ${V.esc(c.name)}!**\nDeine Mannschaft findest du in ${cfg.channels.team ? `<#${cfg.channels.team}>` : "Meine-Mannschaft"}.`, embeds: [], components: [] });
  }

  if (id.startsWith("tk_m:")) {
    const cat = id.slice(5);
    if (!SUP.TICKET_CATS[cat]) return eph("Unbekannte Kategorie.");
    return background(i, context, async () => {
      const r = await SUP.createTicket({ uid, name: i.member?.user?.username, cat, text: v.text?.trim() || "" });
      return r.existing ? `Du hast schon ein offenes Ticket: <#${r.channelId}>` : `✅ Dein Ticket ist offen: <#${r.channelId}>`;
    }, { update: isEphemeralMsg(i) });
  }
  if (id.startsWith("ap_m:")) {
    const pos = id.slice(5);
    if (!SUP.POSITIONS[pos]) return eph("Unbekannte Position.");
    return background(i, context, async () => {
      const a = await SUP.submitApplication(uid, pos, v);
      return `✅ Deine Bewerbung als **${SUP.POSITIONS[pos].label}** (#${a.id}) ist eingegangen. Die Antwort bekommst du im Benachrichtigungs-Kanal.`;
    }, { update: isEphemeralMsg(i) });
  }
  if (id.startsWith("ap_no_m:")) {
    if (!SUP.isServerAdmin(i.member)) return eph("Über Bewerbungen entscheiden nur Server-Admins.");
    const appId = Number(id.split(":")[1]);
    return background(i, context, async () => { await SUP.decideApplication(appId, false, uid, v.reason?.trim() || ""); return `❌ Bewerbung #${appId} abgelehnt. Die Person wurde benachrichtigt.`; });
  }

  if (id.startsWith("ban_m:")) {
    if (!isStaff(i, cfg)) return reply(i, { content: "❌ Sperren können nur die **Turnierleitung** und **Mods**.", components: [] });
    return doBan(i, context, id.slice("ban_m:".length), v.note?.trim() || "");
  }

  if (id === "vid_min") {
    const min = /^\d{1,3}$/.test((v.min || "").trim()) ? Number(v.min) : null;
    if (min === null) return eph("Bitte die aktuelle Spielminute als Zahl eintragen.");
    if (min > VIDEO_WINDOW_MIN || min < 1) return eph(`⏱️ Größenvideos können nur in den ersten **${VIDEO_WINDOW_MIN} Spielminuten** angefordert werden.`);
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const t0 = await resolveTournament(i);
    const { value: t, result } = await mutate(tKey(t0.channelId), (t) => T.requestVideo(t, mine.club, VIDEO_LIMIT, VIDEO_WINDOW_MIN, min));
    later(context, () => F.postVideoRequest(t, result.v, result.m));
    return eph(`✅ Größenvideo bei ${flagOf(result.v.to)} **${V.esc(result.v.to)}** angefordert (${min}. Spielminute). Noch **${result.left}** von ${VIDEO_LIMIT} Anforderungen übrig.`);
  }

  if (id === "team_ea_m") {
    const ea = v.ea.trim();
    if (ea.length < 3) return reply(i, { content: "Der EA-Clubname braucht mindestens 3 Zeichen." });
    const clubs = await getClubs(), mine = F.clubOfUser(clubs, uid);
    if (!mine) return reply(i, { content: "Du bist keiner Mannschaft zugeordnet.", embeds: [], components: [] });
    const { value } = await mutate("clubs", (cl) => { const x = cl[mine.club]; if (x && x.ea !== ea) Object.assign(x, { ea, eaId: null, eaName: null, eaLookup: null }); }, { initial: {} });
    if (EAF.eaEnabled()) later(context, () => EAF.linkEaClub(mine.club, { force: true }));
    return reply(i, { ...V.teamDetail(mine.club, value[mine.club], mine.role, daysBetween(value[mine.club].lastPlayed || todayKey(), todayKey())), content: "✅ EA-Club gespeichert. Die Verknüpfung mit EA läuft im Hintergrund – öffne das Fenster gleich nochmal, um den Status zu sehen." });
  }

  if (id.startsWith("res:")) {
    const matchId = Number(id.split(":")[1]);
    const h = /^\d{1,2}$/.test(v.h?.trim()) ? Number(v.h) : null, a = /^\d{1,2}$/.test(v.a?.trim()) ? Number(v.a) : null;
    if (h === null || a === null) return eph("Bitte bei beiden Mannschaften die Tore als Zahl eintragen.");
    const pen = v.pen?.trim() ? T.parseScore(v.pen) : null;
    if (v.pen?.trim() && !pen) return eph("Elfmeter bitte so angeben: `4:3`");
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    return background(i, context, async () => {
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => {
        const r = T.report(t, matchId, mine.club, h, a, pen);
        return { state: r.state, events: r.state === "bestaetigt" ? T.advance(t) : [] };
      });
      const m = t.matches.find((x) => x.id === matchId);
      if (result.state === "wartet") { await F.askOpponent(t, m, mine.club, h, a, pen); return "📨 Ergebnis eingetragen. Der Gegner hat 2 Minuten zum Bestätigen – danach gilt es automatisch."; }
      if (result.state === "konflikt") { await F.notifyConflict(t, m); return "⚠️ Euer Ergebnis weicht vom Gegner ab. Die Turnierleitung wurde markiert und entscheidet."; }
      await F.afterResult(t, m, result.events);
      return `✅ Ergebnis bestätigt: ${V.matchLine(m, false)}`;
    });
  }
  return eph("Unbekanntes Formular.");
}

// ---------- Support-Tickets ----------
async function ticketComponent(i, context, cfg, id, uid) {
  if (id === "tk_open") {
    const open = (await get("tickets"))?.open?.[uid];
    if (open && !String(open).startsWith("p:") && (await SUP.ticketOf(open)) && (await discord(`/channels/${open}`))) return eph(`Du hast schon ein offenes Ticket: <#${open}>`);
    return { type: 4, data: { flags: 64, ...SUP.ticketCatSelect() } };
  }
  if (id === "tk_cat") return SUP.ticketModal(i.data.values[0]);
  const tk = await SUP.ticketOf(i.channel_id);
  if (!tk) return eph("Dieses Ticket gibt es nicht mehr.");
  const staff = SUP.isTicketStaff(i.member, cfg);
  if (id === "tk_claim") {
    if (!staff) return eph("Übernehmen kann nur das Staff-Team.");
    return background(i, context, async () => { await SUP.claimTicket(i.channel_id, uid); return "✅ Du hast das Ticket übernommen."; });
  }
  if (id === "tk_add") {
    if (!staff) return eph("Personen hinzufügen kann nur das Staff-Team.");
    return { type: 4, data: { flags: 64, content: "Wen möchtest du hinzufügen?", components: [{ type: 1, components: [{ type: 5, custom_id: "tk_add_pick", placeholder: "Person wählen" }] }] } };
  }
  if (id === "tk_add_pick") {
    if (!staff) return eph("Personen hinzufügen kann nur das Staff-Team.");
    const target = i.data.values?.[0];
    return background(i, context, async () => { await SUP.addToTicket(i.channel_id, target); return `✅ <@${target}> hinzugefügt.`; }, { update: true });
  }
  if (id === "tk_close") {
    if (!staff && tk.uid !== uid) return eph("Schließen kann nur die Person selbst oder das Staff-Team.");
    return { type: 4, data: { flags: 64, content: "🔒 **Ticket wirklich schließen?** Der Kanal wird gelöscht, der Verlauf wird nicht gespeichert.", components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "tk_close_no" }, { type: 2, style: 4, label: "Ja, schließen", custom_id: "tk_close_ok" }] }] } };
  }
  if (id === "tk_close_no") return reply(i, { content: "Abgebrochen.", components: [] });
  if (id === "tk_close_ok") {
    if (!staff && tk.uid !== uid) return eph("Schließen kann nur die Person selbst oder das Staff-Team.");
    later(context, () => SUP.closeTicket(i.channel_id, uid));
    return reply(i, { content: "🔒 Das Ticket wird geschlossen …", components: [] });
  }
  return eph("Unbekannte Aktion.");
}

// ---------- Staff-Bewerbungen ----------
async function applyComponent(i, context, id, uid) {
  if (id === "ap_open") {
    try { await SUP.applyCheck(uid); } catch (e) { return eph(`❌ ${e.message}`); }
    return { type: 4, data: { flags: 64, ...SUP.applyPosSelect() } };
  }
  if (id === "ap_pos") {
    try { await SUP.applyCheck(uid); } catch (e) { return reply(i, { content: `❌ ${e.message}`, components: [] }); }
    return SUP.applyModal(i.data.values[0]);
  }
  if (!SUP.isServerAdmin(i.member)) return eph("Über Bewerbungen entscheiden nur Server-Admins.");
  const appId = Number(id.split(":")[1]);
  if (id.startsWith("ap_yes:")) return background(i, context, async () => { const r = await SUP.decideApplication(appId, true, uid); return `✅ Bewerbung #${appId} angenommen.${r.roleMissing ? " ⚠️ Die Rolle ist noch nicht verknüpft – `/cl-einrichten rollen` ausführen und die Rolle von Hand vergeben." : " Die Rolle wird vergeben."}`; });
  if (id.startsWith("ap_no:")) return SUP.rejectModal(appId);
  if (id.startsWith("ap_talk:")) {
    return background(i, context, async () => {
      const a = await SUP.getApplication(appId);
      if (!a) throw new Error("Diese Bewerbung gibt es nicht mehr.");
      const r = await SUP.createTicket({ uid: a.uid, name: `bewerbung-${a.id}`, cat: "gespraech", text: `Gespräch zur Bewerbung #${a.id} als ${SUP.POSITIONS[a.pos].label}.`, extra: [uid] });
      return `💬 ${r.existing ? "Die Person hatte schon ein offenes Ticket – du wurdest hinzugefügt" : "Gesprächs-Ticket erstellt"}: <#${r.channelId}>`;
    });
  }
  return eph("Unbekannte Aktion.");
}

async function doBan(i, context, rest, note) {
  const [u, r, d, both] = rest.split(":");
  const users = [u];
  if (both === "2") {
    const mine = F.clubOfUser(await getClubs(), u);
    const partner = mine ? (mine.role === "manager" ? mine.data.co : mine.data.manager) : null;
    if (partner) users.push(partner);
  }
  later(context, () => B.ban(users, Number(r), Number(d), uidOf(i), note));
  return reply(i, { content: `✅ ${users.map((x) => `<@${x}>`).join(" und ")} ${users.length > 1 ? "sind" : "ist"} für **${d} ${d === "1" ? "Tag" : "Tage"}** gesperrt. Die Sperrliste wird aktualisiert, und die Betroffenen werden im Benachrichtigungs-Kanal markiert.`, components: [] });
}
