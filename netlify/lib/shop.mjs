// Vereinskasse & Shop.
// Coins gehören dem Verein (Manager + Co-VM). Wird der Verein frei, ist die Kasse weg (der Verein wird gelöscht).
// Gutschrift automatisch nach jedem Cup (nicht bei Test-Cups), Ausgeben im Shop – kaufen darf nur der Manager.
import { get, mutate, getConfig, getClubs } from "./store.mjs";
import { discord, sendMessage, upsertMessage } from "./discord.mjs";
import { enqueue } from "./roles.mjs";
import { nickFor, setNick } from "./names.mjs";
import { COLOR, isFreilos, flagOf } from "./data.mjs";
import * as T from "./tournament.mjs";

const G = () => process.env.DISCORD_GUILD_ID;
const esc = (s) => String(s ?? "").replace(/([*_`~|\\>])/g, "\\$1");
const btn = (label, custom_id, style = 2, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });
const row = (...components) => ({ type: 1, components });

// ---------- Einstellungen (hier anpassen) ----------
export const COINS = {
  teilnahme: 20,      // Teilnahme am Cup (eingecheckt)
  sieg: 10,
  remis: 5,
  niederlage: -5,
  tor: 2,             // pro geschossenem Tor
  zunull: 5,          // kein Gegentor
  gruppensieger: 20,
  finale: 100,        // Finale erreicht (beide Finalisten)
  halbfinale: 50,     // Halbfinale erreicht
  platz3: 30,         // Spiel um Platz 3 gewonnen
};
export const ITEMS = {
  iv: { label: "Großer IV", emoji: "📏", price: 1750, text: "Im nächsten Cup darf 1 Innenverteidiger bis 1,90 m groß sein." },
  urlaub: { label: "Urlaubsschutz", emoji: "🛡️", price: 1500, text: "Die 7-Tage-Regel pausiert 7 Tage." },
  boost: { label: "Große Verstärkung", emoji: "🟣", price: 750, text: "Im nächsten Cup darf das ganze Team lila Verstärkung benutzen." },
  abzeichen: { label: "König-Abzeichen", emoji: "👑", price: 300, text: "Das 👑 hinter euren Spitznamen, z. B. „VM | Real Madrid 👑“." },
};
export const BADGES = ["👑"];
const LOG_MAX = 10;

const book = (c, delta, txt) => {
  c.coins = Math.max(0, (c.coins || 0) + delta);
  c.coinLog = [{ at: Date.now(), d: delta, txt }, ...(c.coinLog || [])].slice(0, LOG_MAX);
};

// ---------- Gutschrift nach dem Cup ----------
/** Coins pro Verein für einen beendeten Cup. Rückgabe: { [club]: { total, parts: [[text, coins]] } } */
export function cupCoins(t) {
  const virtual = new Set(t.virtual || []);
  const real = new Set((t.checked || []).filter((c) => !isFreilos(c) && !virtual.has(c)));
  const out = {};
  const add = (c, txt, n) => { if (!real.has(c) || !n) return; const o = (out[c] ||= { total: 0, parts: {} }); o.total += n; o.parts[txt] = (o.parts[txt] || 0) + n; };
  for (const c of real) add(c, "Teilnahme", COINS.teilnahme);
  for (const m of t.matches) {
    if (m.status !== "fertig" || m.ff) continue; // kampflose Spiele (Freilos, nicht eingecheckt) zählen nicht
    for (const [me, op, gf, ga] of [[m.home, m.away, m.h, m.a], [m.away, m.home, m.a, m.h]]) {
      if (isFreilos(op)) continue;
      add(me, gf > ga ? "Siege" : gf === ga ? "Remis" : "Niederlagen", gf > ga ? COINS.sieg : gf === ga ? COINS.remis : COINS.niederlage);
      add(me, "Tore", gf * COINS.tor);
      if (ga === 0) add(me, "Zu-null", COINS.zunull);
    }
  }
  for (const g of t.groups || []) { const top = T.standings(t, g.name)[0]; if (top) add(top.id, "Gruppensieger", COINS.gruppensieger); }
  for (const m of t.matches.filter((x) => x.phase === "ko")) {
    const name = m.p3 ? "Spiel um Platz 3" : T.koRoundName(t, m.round);
    if (name === "Finale") { add(m.home, "Finale", COINS.finale); add(m.away, "Finale", COINS.finale); }
    if (name === "Halbfinale") { add(m.home, "Halbfinale", COINS.halbfinale); add(m.away, "Halbfinale", COINS.halbfinale); }
    if (m.p3 && m.status === "fertig") {
      const w = m.h > m.a || (m.h === m.a && m.pen?.[0] > m.pen?.[1]) ? m.home : m.away;
      add(w, "Platz 3", COINS.platz3);
    }
  }
  for (const o of Object.values(out)) o.parts = Object.entries(o.parts);
  return out;
}

/** Nach dem Cup gutschreiben und eine Übersicht in den Turnierkanal posten */
export async function payoutCup(t) {
  if (t.test || t.coinsPaid) return;
  const res = cupCoins(t);
  const { value: clubs } = await mutate("clubs", (cl) => {
    for (const [c, r] of Object.entries(res)) if (cl[c]) book(cl[c], r.total, `${t.name}`);
  }, { initial: {} });
  const lines = Object.entries(res).filter(([c]) => clubs[c]).sort((a, b) => b[1].total - a[1].total)
    .map(([c, r]) => `${flagOf(c)} **${esc(c)}** ${r.total >= 0 ? "+" : ""}${r.total} 🪙 · Kasse: **${clubs[c].coins}**\n-# ${r.parts.map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(" · ")}`);
  if (lines.length) {
    const chunks = [];
    for (const l of lines) { if (!chunks.length || (chunks.at(-1) + l).length > 3800) chunks.push(""); chunks[chunks.length - 1] += l + "\n"; }
    for (const [k, desc] of chunks.entries()) await sendMessage(t.channelId, { embeds: [{ color: COLOR, title: k ? "💰 Vereinskasse (Fortsetzung)" : "💰 Vereinskasse – Gutschriften", description: desc }] });
  }
  await refreshShopPanel();
}

// ---------- Shop-Panel ----------
export function shopPanel(clubs, treasury = {}, feedbackCh = null) {
  const owned = Object.entries(clubs).filter(([, c]) => (c.coins || 0) > 0).map(([n, c]) => [n, c.coins, false]);
  const free = Object.entries(treasury).filter(([n, x]) => !clubs[n] && (x.coins || 0) > 0).map(([n, x]) => [n, x.coins, true]);
  const rich = [...owned, ...free].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const medal = ["🥇", "🥈", "🥉"];
  const fmt = (n) => Number(n).toLocaleString("de-DE");
  return {
    embeds: [
      {
        color: COLOR, title: "🛒 SHOP · VEREINSKASSE",
        description: "Mit jedem Cup verdient euer Verein Coins 🪙. Kaufen darf nur der **Manager**.",
        fields: [
          ...Object.values(ITEMS).map((it) => ({ name: `${it.emoji} ${it.label} · ${fmt(it.price)} 🪙`, value: it.text, inline: true })),
          { name: "So verdient ihr Coins", value: `Teilnahme +${COINS.teilnahme} · Sieg +${COINS.sieg} · Remis +${COINS.remis} · Niederlage ${COINS.niederlage} · Tor +${COINS.tor} · Zu null +${COINS.zunull}\nGruppensieger +${COINS.gruppensieger} · Halbfinale +${COINS.halbfinale} · Finale +${COINS.finale} · Platz 3 +${COINS.platz3}` },
          { name: "ℹ️ So funktioniert die Vereinskasse", value: `Ihr könnt eure Coins sammeln und bei einem **Cash Cup** einlösen – so verschafft ihr euch dort mehr Vorteile.\n\nDie Coins gehören nicht dem Spieler, sondern der **Mannschaft**. Wer den Verein verlässt, lässt die Coins da – wer den Verein danach übernimmt, bekommt die Kasse.\n\nIdeen für mehr Sachen im Shop? Schreibt sie in ${feedbackCh ? `<#${feedbackCh}>` : "**#Feedback**"}.` },
        ],
      },
      { color: COLOR, title: "💰 Reichste Vereine", description: rich.length ? rich.map(([n, coins, isFree], i) => `${medal[i] || `**${i + 1}.**`} ${flagOf(n)} ${esc(n)} – **${fmt(coins)}** 🪙${isFree ? " · *frei – zu übernehmen!*" : ""}`).join("\n") : "_Noch keine Coins verdient – spielt den ersten Cup!_" },
    ],
    components: [
      row(...Object.entries(ITEMS).map(([k, it]) => btn(it.label, `shop_buy:${k}`, 1, { emoji: { name: it.emoji } }))),
      row(btn("Meine Kasse", "shop_me", 2, { emoji: { name: "💰" } })),
    ],
  };
}

export async function refreshShopPanel() {
  const cfg = await getConfig(); if (!cfg.channels.shop) return;
  const p = (await get("panels")) || {};
  const id = await upsertMessage(cfg.channels.shop, p.shop, shopPanel(await getClubs(), (await get("treasury")) || {}, cfg.channels.feedback));
  if (id && id !== p.shop) await mutate("panels", (x) => { x.shop = id; }, { initial: { over: [] } });
}

export function balanceView(name, c) {
  const inv = [
    c.badge ? `👑 König-Abzeichen` : null,
    c.bigIV ? `📏 ${c.bigIV}× Großer IV (wird beim nächsten Cup automatisch eingelöst)` : null,
    c.boost ? `🟣 ${c.boost}× Große Verstärkung (wird beim nächsten Cup automatisch eingelöst)` : null,
    c.protectUntil > Date.now() ? `🛡️ Urlaubsschutz bis <t:${Math.floor(c.protectUntil / 1000)}:f>` : null,
  ].filter(Boolean);
  return {
    content: "",
    embeds: [{
      color: COLOR, title: `💰 Vereinskasse · ${flagOf(name)} ${name}`,
      description: `**${c.coins || 0}** 🪙`,
      fields: [
        { name: "Gekauft", value: inv.length ? inv.join("\n") : "–" },
        { name: "Letzte Buchungen", value: (c.coinLog || []).length ? c.coinLog.map((l) => `\`${l.d >= 0 ? "+" : ""}${l.d}\` ${esc(l.txt)} · <t:${Math.floor(l.at / 1000)}:d>`).join("\n").slice(0, 1024) : "–" },
      ],
    }],
    components: [],
    allowed_mentions: { parse: [] },
  };
}

// ---------- Kaufen ----------
/** Coins abbuchen (atomar). Wirft einen Fehler, wenn das Geld nicht reicht. */
async function charge(name, uid, item, extra = (c) => {}) {
  const it = ITEMS[item];
  const { value } = await mutate("clubs", (cl) => {
    const c = cl[name];
    if (!c || c.manager !== uid) throw new Error("Kaufen darf nur der Manager des Vereins.");
    if ((c.coins || 0) < it.price) throw new Error(`Dafür reicht eure Kasse nicht: **${c.coins || 0}** von **${it.price}** 🪙.`);
    book(c, -it.price, `Shop: ${it.label}`);
    extra(c);
  }, { initial: {} });
  return value[name];
}
async function refund(name, item) {
  const it = ITEMS[item];
  await mutate("clubs", (cl) => { if (cl[name]) book(cl[name], it.price, `Erstattung: ${it.label}`); }, { initial: {} });
}

export const parseColor = (s) => {
  const m = String(s || "").trim().replace(/^#/, "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  return parseInt(h, 16);
};

export async function buyColor(name, uid, color) {
  const cfg = await getConfig();
  const c = await charge(name, uid, "farbe");
  try {
    let roleId = c.colorRole;
    if (roleId && !(await discord(`/guilds/${G()}/roles/${roleId}`, "PATCH", { color }, { reason: "Shop: Vereinsfarbe" }))) roleId = null;
    if (!roleId) {
      const r = await discord(`/guilds/${G()}/roles`, "POST", { name: `🎨 ${name}`, color, permissions: "0", mentionable: false }, { reason: "Shop: Vereinsfarbe" });
      if (!r) throw new Error("Ich konnte die Farb-Rolle nicht anlegen – fehlt dem Bot das Recht „Rollen verwalten“?");
      roleId = r.id;
      // Über die Manager-Rolle schieben, damit die Farbe sichtbar ist
      const roles = (await discord(`/guilds/${G()}/roles`)) || [];
      const mgr = roles.find((x) => x.id === cfg.roles?.manager);
      if (mgr) await discord(`/guilds/${G()}/roles`, "PATCH", [{ id: roleId, position: mgr.position + 1 }]);
      await mutate("clubs", (cl) => { if (cl[name]) cl[name].colorRole = roleId; }, { initial: {} });
    }
    await enqueue([c.manager, c.co].filter(Boolean).map((u) => ({ u, add: [roleId], why: "Shop: Vereinsfarbe" })));
    return roleId;
  } catch (e) { await refund(name, "farbe"); throw e; }
}

export async function buyBadge(name, uid, badge = "👑") {
  if (!BADGES.includes(badge)) throw new Error("Unbekanntes Abzeichen.");
  const c = await charge(name, uid, "abzeichen", (x) => { if (x.badge === badge) throw new Error("Ihr habt das 👑 König-Abzeichen schon."); x.badge = badge; });
  if (c.managerBase) await setNick(c.manager, nickFor(c.managerBase, "manager", name, badge));
  if (c.co && c.coBase) await setNick(c.co, nickFor(c.coBase, "co", name, badge));
}

export async function buyBoost(name, uid) { const c = await charge(name, uid, "boost", (x) => { x.boost = (x.boost || 0) + 1; }); return c.boost; }
export async function buyIV(name, uid) { const c = await charge(name, uid, "iv", (x) => { x.bigIV = (x.bigIV || 0) + 1; }); return c.bigIV; }

/**
 * Beim Check-in-Ende: Jedes eingecheckte Team löst je einen „Großen IV“ und eine „Große Verstärkung“ ein,
 * falls vorhanden – gilt für diesen Cup. Rückgabe: { bigIV: [Vereine], boost: [Vereine] }
 */
export async function redeemCupItems(t) {
  if (t.test) return { bigIV: [], boost: [] };
  const playing = new Set((t.checked || []).filter((c) => !isFreilos(c)));
  const { result } = await mutate("clubs", (cl) => {
    const r = { bigIV: [], boost: [] };
    for (const c of playing) {
      if (cl[c]?.bigIV > 0) { cl[c].bigIV--; r.bigIV.push(c); book(cl[c], 0, `Großer IV eingelöst: ${t.name}`); }
      if (cl[c]?.boost > 0) { cl[c].boost--; r.boost.push(c); book(cl[c], 0, `Große Verstärkung eingelöst: ${t.name}`); }
    }
    return r;
  }, { initial: {} });
  return result || { bigIV: [], boost: [] };
}

// ---------- Kasse bleibt beim Verein ----------
const KEEP = ["coins", "coinLog", "bigIV", "boost"];
/** Verein wird frei: Kasse und Gutscheine im Tresor parken, bis jemand den Verein übernimmt */
export async function parkTreasury(name, data) {
  if (!data || !KEEP.some((k) => data[k])) return;
  await mutate("treasury", (tr) => { tr[name] = Object.fromEntries(KEEP.filter((k) => data[k] != null).map((k) => [k, data[k]])); }, { initial: {} });
}
/** Neuer Manager übernimmt den Verein: Kasse aus dem Tresor zurückholen */
export async function claimTreasury(name) {
  const { result } = await mutate("treasury", (tr) => { const x = tr[name]; delete tr[name]; return x || null; }, { initial: {} });
  if (!result) return null;
  await mutate("clubs", (cl) => { if (cl[name]) Object.assign(cl[name], result, { coinLog: [{ at: Date.now(), d: 0, txt: "Kasse vom Vorgänger übernommen" }, ...(result.coinLog || [])].slice(0, LOG_MAX) }); }, { initial: {} });
  return result;
}

// ---------- Turnierleitung ----------
export async function adminCoins(name, delta, reason) {
  const { value } = await mutate("clubs", (cl) => {
    if (!cl[name]) throw new Error("Dieser Verein ist nicht vergeben.");
    book(cl[name], delta, reason ? `Turnierleitung: ${reason}` : "Turnierleitung");
  }, { initial: {} });
  await refreshShopPanel();
  return value[name].coins;
}

/** Farb-Rollen aktuell halten: nur Manager und Co-VM des Vereins tragen sie (läuft jede Minute) */
export async function syncColorRoles(members) {
  if (!members) return;
  const clubs = await getClubs();
  const owner = new Map();
  for (const c of Object.values(clubs)) if (c.colorRole) owner.set(c.colorRole, new Set([c.manager, c.co].filter(Boolean)));
  const pending = new Set(((await get("rolequeue")) || []).map((o) => o.u));
  const ops = [];
  for (const m of members) {
    if (pending.has(m.user.id)) continue;
    const add = [...owner].filter(([r, us]) => us.has(m.user.id) && !m.roles.includes(r)).map(([r]) => r);
    const rem = m.roles.filter((r) => owner.has(r) && !owner.get(r).has(m.user.id));
    if (add.length || rem.length) ops.push({ u: m.user.id, add, rem, why: "Vereinsfarbe abgeglichen" });
  }
  await enqueue(ops);
}

/** Beim Freigeben eines Vereins die Farb-Rolle löschen */
export async function deleteColorRole(roleId) { if (roleId) await discord(`/guilds/${G()}/roles/${roleId}`, "DELETE", undefined, { reason: "Verein frei – Vereinsfarbe entfernt" }); }

/** Tag, ab dem die 7-Tage-Regel zählt (Urlaubsschutz verschiebt ihn nach hinten) */
export function lastActiveKey(c, todayKeyFn) {
  const last = c.lastPlayed || todayKeyFn();
  const prot = c.protectUntil ? todayKeyFn(c.protectUntil) : "";
  return prot > last ? prot : last;
}
