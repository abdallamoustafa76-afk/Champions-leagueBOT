// Support-Tickets und Staff-Bewerbungen.
// Tickets: privater Kanal pro Anliegen (Person + Staff), beim Schließen wird der Kanal gelöscht – kein Verlauf.
// Bewerbungen: Formular → Karte im Admin-Kanal → nur Server-Admins entscheiden, Rolle wird automatisch vergeben.
import { get, mutate, getConfig } from "./store.mjs";
import { discord, sendMessage, editMessage, upsertMessage } from "./discord.mjs";
import { notify } from "./notify.mjs";
import { enqueue } from "./roles.mjs";
import { COLOR } from "./data.mjs";

const G = () => process.env.DISCORD_GUILD_ID;
const P = { VIEW: 1n << 10n, SEND: 1n << 11n, EMBED: 1n << 14n, FILES: 1n << 15n, HISTORY: 1n << 16n, MANAGE: 1n << 4n };
const bits = (...xs) => xs.reduce((a, b) => a | b, 0n).toString();
const MEMBER = bits(P.VIEW, P.SEND, P.HISTORY, P.FILES, P.EMBED);
const btn = (label, custom_id, style = 2, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });
const row = (...components) => ({ type: 1, components });
const site = () => process.env.SITE_URL || process.env.URL || "";
const esc = (s) => String(s ?? "").replace(/([*_`~|\\>])/g, "\\$1");

// ---------- Einstellungen ----------
export const TICKET_CATS = {
  frage: { label: "Frage", emoji: "❓" },
  spiel: { label: "Problem mit Spiel/Ergebnis", emoji: "⚽" },
  melden: { label: "Spieler melden", emoji: "🚩" },
  sperre: { label: "Einspruch gegen Sperre", emoji: "⚖️" },
  sonst: { label: "Sonstiges", emoji: "📝" },
  gespraech: { label: "Bewerbungsgespräch", emoji: "📋", internal: true },
};
export const POSITIONS = {
  moderator: { label: "Moderator", emoji: "🛡️", role: "moderator", text: "Hilft bei Streit, Regelverstößen und Sperren." },
  support: { label: "Support", emoji: "🛟", role: "support", text: "Beantwortet Tickets und hilft Mitgliedern weiter." },
};
export const APPLY_COOLDOWN_DAYS = 14;
const QUESTIONS = [
  { id: "alter", label: "Wie alt bist du?", style: 1, max: 3 },
  { id: "aktiv", label: "Wie viele Stunden pro Woche bist du aktiv?", style: 1, max: 60 },
  { id: "erfahrung", label: "Hast du schon Erfahrung als Staff?", style: 2, max: 600 },
  { id: "warum", label: "Warum willst du ins Team?", style: 2, max: 1000 },
  { id: "sonst", label: "Sonstiges (optional)", style: 2, max: 600, optional: true },
];

/** Staff für Tickets: Turnierleitung, Moderator, Support, Server-Admins */
export function isTicketStaff(member, cfg) {
  const r = member?.roles || [];
  if ((BigInt(member?.permissions ?? "0") & 8n) === 8n) return true;
  return [cfg.roles?.turnierleitung, cfg.roles?.moderator, cfg.roles?.support, process.env.ADMIN_ROLE_ID].some((id) => id && r.includes(id));
}
export const isServerAdmin = (member) => (BigInt(member?.permissions ?? "0") & 8n) === 8n;
const staffRoles = (cfg) => [cfg.roles?.turnierleitung, cfg.roles?.moderator, cfg.roles?.support].filter(Boolean);

// =====================================================================
// Tickets
// =====================================================================
export function ticketPanel() {
  return {
    embeds: [{
      color: COLOR, title: "🛟 SUPPORT",
      thumbnail: { url: `${site()}/logo.jpg` },
      description: "Du hast eine Frage, ein Problem mit einem Spiel oder willst etwas melden?\nÖffne ein Ticket – nur du und das Staff-Team sehen es.",
      fields: Object.values(TICKET_CATS).filter((c) => !c.internal).map((c) => ({ name: `${c.emoji} ${c.label}`, value: "\u200b", inline: true })),
      footer: { text: "Pro Person ist ein offenes Ticket möglich." },
    }],
    components: [row(btn("Ticket öffnen", "tk_open", 1, { emoji: { name: "🎫" } }))],
  };
}

export function ticketCatSelect() {
  return {
    content: "**Worum geht es?**",
    components: [row({
      type: 3, custom_id: "tk_cat", placeholder: "Kategorie wählen",
      options: Object.entries(TICKET_CATS).filter(([, c]) => !c.internal).map(([value, c]) => ({ label: c.label, value, emoji: { name: c.emoji } })),
    })],
  };
}

export function ticketModal(cat) {
  return {
    type: 9,
    data: {
      custom_id: `tk_m:${cat}`, title: `${TICKET_CATS[cat]?.label || "Ticket"}`.slice(0, 45),
      components: [row({ type: 4, custom_id: "text", label: "Beschreib dein Anliegen", style: 2, required: true, min_length: 10, max_length: 1000, placeholder: "Was ist passiert? Wer ist beteiligt? Spiel-Nr., falls es um ein Spiel geht." })],
    },
  };
}

function ticketControls(claimedBy) {
  return [row(
    btn(claimedBy ? "Übernommen" : "Übernehmen", "tk_claim", 3, { emoji: { name: "🙋" }, disabled: !!claimedBy }),
    btn("Person hinzufügen", "tk_add", 2, { emoji: { name: "➕" } }),
    btn("Ticket schließen", "tk_close", 4, { emoji: { name: "🔒" } }),
  )];
}

function ticketWelcome(tk, cfg) {
  const c = TICKET_CATS[tk.cat] || TICKET_CATS.sonst;
  const roles = staffRoles(cfg);
  return {
    content: `<@${tk.uid}> ${roles.map((r) => `<@&${r}>`).join(" ")}`,
    allowed_mentions: { users: [tk.uid], roles },
    embeds: [{
      color: COLOR, title: `${c.emoji} Ticket #${String(tk.n).padStart(4, "0")} · ${c.label}`,
      description: `${tk.text ? esc(tk.text) : "–"}\n\n-# Das Staff-Team meldet sich hier. Schließen kann das Ticket die Person selbst oder der Staff – der Kanal wird dann gelöscht.`,
      footer: { text: "Champions League Bot · Support" },
    }],
    components: ticketControls(tk.claimedBy),
  };
}

/** Kanal-Prüfung: gibt es den Ticket-Kanal noch? */
async function channelExists(id) { return !!(id && (await discord(`/channels/${id}`))); }

/**
 * Ticket öffnen. Rückgabe: { channelId, existing? }
 * extra: weitere Nutzer, die das Ticket sehen sollen (z. B. der Admin beim Bewerbungsgespräch).
 */
export async function createTicket({ uid, name, cat, text, extra = [] }) {
  const cfg = await getConfig();
  const old = (await get("tickets"))?.open?.[uid];
  const pending = (v) => String(v).startsWith("p:") && Date.now() - Number(String(v).slice(2)) < 120000;
  if (old && pending(old)) throw new Error("Dein Ticket wird gerade erstellt – einen Moment.");
  if (old && !String(old).startsWith("p:") && (await channelExists(old))) {
    for (const u of extra) await addToTicket(old, u);
    return { channelId: old, existing: true };
  }
  const { result: n } = await mutate("tickets", (t) => {
    t.open ||= {}; t.byCh ||= {};
    if (t.open[uid] && t.open[uid] !== old) return null; // gerade parallel geöffnet
    t.n = (t.n || 0) + 1; t.open[uid] = `p:${Date.now()}`;
    return t.n;
  }, { initial: { n: 0, open: {}, byCh: {} } });
  if (!n) throw new Error("Dein Ticket wird gerade erstellt – einen Moment.");

  const parent = cfg.channels.support ? (await discord(`/channels/${cfg.channels.support}`))?.parent_id : null;
  const slug = String(name || "user").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "user";
  const overwrites = [
    { id: G(), type: 0, allow: "0", deny: bits(P.VIEW) },
    { id: process.env.DISCORD_APP_ID, type: 1, allow: bits(P.VIEW, P.SEND, P.HISTORY, P.EMBED, P.FILES, P.MANAGE), deny: "0" },
    { id: uid, type: 1, allow: MEMBER, deny: "0" },
    ...staffRoles(cfg).map((r) => ({ id: r, type: 0, allow: MEMBER, deny: "0" })),
    ...extra.filter((u) => u !== uid).map((u) => ({ id: u, type: 1, allow: MEMBER, deny: "0" })),
  ].filter((o) => o.id);
  const ch = await discord(`/guilds/${G()}/channels`, "POST", {
    name: `ticket-${String(n).padStart(4, "0")}-${slug}`, type: 0, parent_id: parent || undefined,
    topic: `${TICKET_CATS[cat]?.label || "Ticket"} · von <@${uid}>`, permission_overwrites: overwrites,
  }, { reason: `Ticket #${n}` });
  if (!ch) {
    await mutate("tickets", (t) => { if (String(t.open[uid]).startsWith("p:")) delete t.open[uid]; });
    throw new Error("Ich konnte keinen Ticket-Kanal anlegen – fehlt dem Bot das Recht „Kanäle verwalten“?");
  }
  const tk = { uid, n, cat, text, at: Date.now(), claimedBy: null, msg: null };
  const msg = await sendMessage(ch.id, ticketWelcome(tk, cfg));
  tk.msg = msg?.id ?? null;
  await mutate("tickets", (t) => { t.open[uid] = ch.id; t.byCh[ch.id] = tk; });
  return { channelId: ch.id, existing: false };
}

export async function ticketOf(channelId) { return (await get("tickets"))?.byCh?.[channelId] ?? null; }

export async function claimTicket(channelId, byUid) {
  const cfg = await getConfig();
  const { result: tk } = await mutate("tickets", (t) => { const x = t.byCh?.[channelId]; if (!x || x.claimedBy) return null; x.claimedBy = byUid; return x; }, { initial: {} });
  if (!tk) throw new Error("Dieses Ticket wurde schon übernommen.");
  if (tk.msg) await editMessage(channelId, tk.msg, { ...ticketWelcome(tk, cfg), content: undefined, allowed_mentions: { parse: [] } });
  await sendMessage(channelId, { content: `🙋 <@${byUid}> kümmert sich um dieses Ticket.`, allowed_mentions: { parse: [] } });
}

export async function addToTicket(channelId, userId) {
  const ok = await discord(`/channels/${channelId}/permissions/${userId}`, "PUT", { type: 1, allow: MEMBER, deny: "0" });
  if (!ok) throw new Error("Ich konnte die Person nicht hinzufügen.");
  await sendMessage(channelId, { content: `➕ <@${userId}> wurde zum Ticket hinzugefügt.`, allowed_mentions: { users: [userId] } });
}

export async function closeTicket(channelId, byUid) {
  const cfg = await getConfig();
  const { result: tk } = await mutate("tickets", (t) => {
    const x = t.byCh?.[channelId]; if (!x) return null;
    delete t.byCh[channelId];
    if (t.open?.[x.uid] === channelId) delete t.open[x.uid];
    return x;
  }, { initial: {} });
  await discord(`/channels/${channelId}`, "DELETE", undefined, { reason: `Ticket geschlossen von ${byUid}` });
  const log = cfg.channels.admin || cfg.channels.log;
  if (tk && log) await sendMessage(log, { content: `🔒 Ticket #${String(tk.n).padStart(4, "0")} (${TICKET_CATS[tk.cat]?.label || "Ticket"}) von <@${tk.uid}> wurde von <@${byUid}> geschlossen.`, allowed_mentions: { parse: [] } });
}

// =====================================================================
// Bewerbungen
// =====================================================================
async function applyState() { return (await get("applications")) || { open: true, n: 0, list: {}, last: {} }; }
const mutateApply = (fn) => mutate("applications", fn, { initial: { open: true, n: 0, list: {}, last: {} } });

export function applyPanel(open) {
  return {
    embeds: [{
      color: COLOR, title: "📋 STAFF-BEWERBUNG",
      thumbnail: { url: `${site()}/logo.jpg` },
      description: open
        ? "Du willst das Team vom Champions League Cup unterstützen? Wähle eine Position und füll das kurze Formular aus.\nDie Admins melden sich bei dir im Benachrichtigungs-Kanal."
        : "🔒 **Bewerbungen sind gerade geschlossen.** Schau später nochmal vorbei.",
      fields: Object.values(POSITIONS).map((p) => ({ name: `${p.emoji} ${p.label}`, value: p.text, inline: true })),
      footer: { text: `Neu bewerben geht frühestens nach ${APPLY_COOLDOWN_DAYS} Tagen.` },
    }],
    components: [row(btn(open ? "Jetzt bewerben" : "Bewerbungen geschlossen", "ap_open", open ? 1 : 2, { emoji: { name: "📝" }, disabled: !open }))],
  };
}

export async function refreshApplyPanel() {
  const cfg = await getConfig(); if (!cfg.channels.bewerbung) return;
  const s = await applyState(), p = (await get("panels")) || {};
  const id = await upsertMessage(cfg.channels.bewerbung, p.apply, applyPanel(s.open !== false));
  if (id && id !== p.apply) await mutate("panels", (x) => { x.apply = id; }, { initial: { over: [] } });
}
export async function refreshTicketPanel() {
  const cfg = await getConfig(); if (!cfg.channels.support) return;
  const p = (await get("panels")) || {};
  const id = await upsertMessage(cfg.channels.support, p.ticket, ticketPanel());
  if (id && id !== p.ticket) await mutate("panels", (x) => { x.ticket = id; }, { initial: { over: [] } });
}

/** Vor dem Formular prüfen: offen, keine offene Bewerbung, Wartezeit vorbei */
export async function applyCheck(uid) {
  const s = await applyState();
  if (s.open === false) throw new Error("Bewerbungen sind gerade geschlossen.");
  if (Object.values(s.list).some((a) => a.uid === uid && a.status === "offen")) throw new Error("Du hast schon eine offene Bewerbung – die Admins melden sich bei dir.");
  const last = s.last?.[uid];
  if (last && Date.now() - last < APPLY_COOLDOWN_DAYS * 86400000) throw new Error(`Du kannst dich erst wieder <t:${Math.floor((last + APPLY_COOLDOWN_DAYS * 86400000) / 1000)}:R> bewerben.`);
}

export function applyPosSelect() {
  return {
    content: "**Für welche Position bewirbst du dich?**",
    components: [row({ type: 3, custom_id: "ap_pos", placeholder: "Position wählen", options: Object.entries(POSITIONS).map(([value, p]) => ({ label: p.label, value, description: p.text.slice(0, 100), emoji: { name: p.emoji } })) })],
  };
}

export function applyModal(pos) {
  return {
    type: 9,
    data: {
      custom_id: `ap_m:${pos}`, title: `Bewerbung als ${POSITIONS[pos].label}`.slice(0, 45),
      components: QUESTIONS.map((q) => row({ type: 4, custom_id: q.id, label: q.label, style: q.style, required: !q.optional, max_length: q.max })),
    },
  };
}

function applyCard(a) {
  const p = POSITIONS[a.pos];
  const status = { offen: "⏳ Offen", angenommen: `✅ Angenommen von <@${a.by}>`, abgelehnt: `❌ Abgelehnt von <@${a.by}>` }[a.status];
  return {
    embeds: [{
      color: a.status === "angenommen" ? 0x2ecc71 : a.status === "abgelehnt" ? 0xe74c3c : COLOR,
      title: `${p.emoji} Bewerbung #${a.id} · ${p.label}`,
      description: `Von <@${a.uid}> · <t:${Math.floor(a.at / 1000)}:f>\n**Status:** ${status}${a.reason ? `\n**Begründung:** ${esc(a.reason)}` : ""}`,
      fields: QUESTIONS.map((q) => ({ name: q.label, value: esc(a.answers[q.id] || "–").slice(0, 1024) })),
      footer: { text: "Entscheiden können nur Server-Admins." },
    }],
    components: a.status === "offen" ? [row(
      btn("Annehmen", `ap_yes:${a.id}`, 3, { emoji: { name: "✅" } }),
      btn("Ablehnen", `ap_no:${a.id}`, 4, { emoji: { name: "❌" } }),
      btn("Gespräch", `ap_talk:${a.id}`, 2, { emoji: { name: "💬" } }),
    )] : [],
    allowed_mentions: { parse: [] },
  };
}

export async function submitApplication(uid, pos, answers) {
  const cfg = await getConfig();
  const ch = cfg.channels.admin || cfg.channels.log;
  if (!ch) throw new Error("Der Admin-Kanal ist noch nicht eingerichtet – bitte melde dich bei der Turnierleitung.");
  await applyCheck(uid);
  const { result: a } = await mutateApply((s) => {
    if (Object.values(s.list).some((x) => x.uid === uid && x.status === "offen")) throw new Error("Du hast schon eine offene Bewerbung.");
    s.n = (s.n || 0) + 1;
    const a = { id: s.n, uid, pos, answers, at: Date.now(), status: "offen", msg: null };
    s.list[a.id] = a; s.last ||= {}; s.last[uid] = a.at;
    return a;
  });
  const msg = await sendMessage(ch, applyCard(a));
  if (msg) await mutateApply((s) => { s.list[a.id].msg = msg.id; s.list[a.id].ch = ch; });
  return a;
}

export async function getApplication(id) { return (await applyState()).list[id] ?? null; }

export async function decideApplication(id, yes, byUid, reason = "") {
  const cfg = await getConfig();
  const { result: a } = await mutateApply((s) => {
    const a = s.list[id];
    if (!a) throw new Error("Diese Bewerbung gibt es nicht mehr.");
    if (a.status !== "offen") throw new Error("Über diese Bewerbung wurde schon entschieden.");
    Object.assign(a, { status: yes ? "angenommen" : "abgelehnt", by: byUid, reason: reason || null, decidedAt: Date.now() });
    return a;
  });
  if (a.ch && a.msg) await editMessage(a.ch, a.msg, applyCard(a));
  const p = POSITIONS[a.pos], role = cfg.roles?.[p.role];
  if (yes && role) await enqueue([{ u: a.uid, add: [role], why: `Bewerbung als ${p.label} angenommen` }]);
  await notify(a.uid, { embeds: [{
    color: yes ? 0x2ecc71 : 0xe74c3c,
    title: yes ? `🎉 Willkommen im Team – ${p.label}!` : `📋 Deine Bewerbung als ${p.label}`,
    description: yes
      ? `Deine Bewerbung wurde **angenommen**. Du hast jetzt die Rolle **${p.label}**.`
      : `Deine Bewerbung wurde leider **abgelehnt**.${reason ? `\n**Begründung:** ${esc(reason)}` : ""}\nDu kannst dich in ${APPLY_COOLDOWN_DAYS} Tagen erneut bewerben.`,
  }] });
  return { a, roleMissing: yes && !role };
}

export async function setApplicationsOpen(open) {
  await mutateApply((s) => { s.open = open; });
  await refreshApplyPanel();
}

export function rejectModal(id) {
  return { type: 9, data: { custom_id: `ap_no_m:${id}`, title: `Bewerbung #${id} ablehnen`, components: [row({ type: 4, custom_id: "reason", label: "Begründung (sieht der Bewerber)", style: 2, required: false, max_length: 500 })] } };
}
