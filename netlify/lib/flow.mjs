// Abläufe mit Discord-Auswirkungen: Posts, Rollen, Phasenwechsel.
import { get, set, del, mutate, keys, getConfig, getClubs, tKey } from "./store.mjs";
import { sendMessage, editMessage, upsertMessage, sendWithFile, pinMessage, deleteMessage } from "./discord.mjs";
import { enqueue } from "./roles.mjs";
import * as T from "./tournament.mjs";
import * as V from "./views.mjs";
import { DAYS, ROUND_ROLES, RULES_VERSION, flagOf } from "./data.mjs";
import { viennaParts, viennaAt, shortDate, todayKey } from "./time.mjs";
import { setNick, nickFor } from "./names.mjs";
import { scheduleCleanup } from "./cleanup.mjs";

// ---------- Hilfen ----------
export function clubOfUser(clubs, uid) {
  for (const [name, c] of Object.entries(clubs)) {
    if (c.manager === uid) return { club: name, role: "manager", data: c };
    if (c.co === uid) return { club: name, role: "co", data: c };
  }
  return null;
}
export const membersOf = (clubs, name) => [clubs[name]?.manager, clubs[name]?.co].filter(Boolean);

async function panels() { return (await get("panels")) || { over: [] }; }
async function savePanel(key, val) { await mutate("panels", (p) => { p[key] = val; }, { initial: { over: [] } }); }

// ---------- Dauerhafte Panels ----------
export async function refreshRegPanel() {
  const cfg = await getConfig(); if (!cfg.channels.reg) return;
  const p = await panels(), clubs = await getClubs();
  const id = await upsertMessage(cfg.channels.reg, p.reg, V.regPanel(clubs));
  if (id && id !== p.reg) { await savePanel("reg", id); await pinMessage(cfg.channels.reg, id); }
}
export async function refreshTeamPanel() {
  const cfg = await getConfig(); if (!cfg.channels.team) return;
  const p = await panels();
  const id = await upsertMessage(cfg.channels.team, p.team, V.teamPanel());
  if (id && id !== p.team) { await savePanel("team", id); await pinMessage(cfg.channels.team, id); }
}
export async function refreshOverview() {
  const cfg = await getConfig(); if (!cfg.channels.over) return;
  const p = await panels(), clubs = await getClubs();
  const msgs = V.overviewMessages(clubs), ids = [];
  for (let i = 0; i < msgs.length; i++) ids.push(await upsertMessage(cfg.channels.over, p.over?.[i], msgs[i]));
  if (JSON.stringify(ids) !== JSON.stringify(p.over)) await savePanel("over", ids);
}

// ---------- Regelwerk ----------
export async function rulesAccepted(uid) {
  const r = (await get("rules")) || {};
  return r[uid] === RULES_VERSION;
}
export async function acceptRules(uid) {
  const { value } = await mutate("rules", (r) => { r[uid] = RULES_VERSION; }, { initial: {} });
  return Object.values(value).filter((v) => v === RULES_VERSION).length;
}
export async function refreshRulesPanel() {
  const cfg = await getConfig(); if (!cfg.channels.rules) return;
  const p = await panels();
  const count = Object.values((await get("rules")) || {}).filter((v) => v === RULES_VERSION).length;
  const id = await upsertMessage(cfg.channels.rules, p.rules, V.rulesPanel(count));
  if (id && id !== p.rules) { await savePanel("rules", id); await pinMessage(cfg.channels.rules, id); }
}

export async function refreshRolesPanel() {
  const cfg = await getConfig(); if (!cfg.channels.roles) return;
  const p = await panels();
  const id = await upsertMessage(cfg.channels.roles, p.roles, V.rolesPanel());
  if (id && id !== p.roles) { await savePanel("roles", id); await pinMessage(cfg.channels.roles, id); }
}

/** Verein freigeben (Verlassen, Löschen, Inaktivität, Manager-Rolle weg). Co-VM übernimmt beim Verlassen. */
export async function releaseClub(name, { transferToCo = false, reason = "" } = {}) {
  const cfg = await getConfig();
  const { result } = await mutateClubsSafe((clubs) => {
    const c = clubs[name]; if (!c) return null;
    if (transferToCo && c.co) {
      const old = { id: c.manager, orig: c.managerOrigNick ?? null };
      c.manager = c.co; c.managerBase = c.coBase; c.managerOrigNick = c.coOrigNick ?? null;
      c.co = null; c.coBase = null; c.coOrigNick = null;
      return { transferred: true, old, now: c.manager, base: c.managerBase };
    }
    delete clubs[name];
    return { transferred: false, co: c.co, manager: c.manager, managerOrig: c.managerOrigNick ?? null, coOrig: c.coOrigNick ?? null };
  });
  if (!result) return null;
  // Spitznamen anpassen bzw. zurücksetzen
  if (result.transferred) {
    await setNick(result.old.id, result.old.orig);
    if (result.base) await setNick(result.now, nickFor(result.base, "manager", name));
  } else {
    if (result.manager) await setNick(result.manager, result.managerOrig);
    if (result.co) await setNick(result.co, result.coOrig);
  }
  if (!result.transferred && result.co) await enqueue([{ u: result.co, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Mannschaft aufgelöst – Co-VM entfernt" }]);
  if (!result.transferred && cfg.channels.reg) await sendMessage(cfg.channels.reg, V.freeAgainPost(name, reason));
  await Promise.all([refreshRegPanel(), refreshOverview()]);
  return result;
}
const mutateClubsSafe = (fn) => mutate("clubs", fn, { initial: {} });

// ---------- Turnier anlegen ----------
export async function activeTournament() {
  const ch = await get("active");
  return ch ? await get(tKey(ch)) : null;
}

export async function launchTournament({ channelId, name, times, day, date }, { replace = false } = {}) {
  const old = await get(tKey(channelId));
  if (old && !["fertig", "abgesagt", "geloescht"].includes(old.status)) {
    if (!replace) throw new Error("In diesem Kanal läuft bereits ein Turnier.");
    if (T.ACTIVE.includes(old.status)) throw new Error("In diesem Kanal läuft gerade noch ein Cup.");
    old.status = "geloescht";
    if (old.msgs.panel) await upsertMessage(channelId, old.msgs.panel, V.signupPanel(old, await getClubs()));
  }
  const t = T.createTournament({ channelId, name, times, day, date });
  const msg = await sendMessage(channelId, V.signupPanel(t, await getClubs()));
  if (!msg) throw new Error(`Ich konnte in <#${channelId}> nichts posten – fehlen dem Bot dort Rechte?`);
  t.msgs.panel = msg.id;
  await set(tKey(channelId), t);
  return t;
}

export async function refreshSignup(t) {
  if (!t.msgs.panel) return;
  const id = await upsertMessage(t.channelId, t.msgs.panel, V.signupPanel(t, await getClubs()));
  if (id && id !== t.msgs.panel) await mutate(tKey(t.channelId), (x) => { x.msgs.panel = id; });
}

/** Zeiten aus dem Anpfiff: Anmeldeschluss/Auslosung 60 Min. vorher, Check-in-Ende 5 Min. vorher */
export const timesFromKickoff = (kickoff) => ({ close: kickoff - 60 * 60000, checkinEnd: kickoff - 5 * 60000, kickoff });

/** Wochenplan: zur Posting-Zeit die Liste des Tages posten */
export async function runSchedule(now = Date.now()) {
  const v = viennaParts(now);
  const plan = (await get("zeitplan")) || {};
  const e = plan[v.weekday];
  if (!e || e.lastPosted === v.dateKey || v.hhmm < e.post) return;
  const { result: claimed } = await mutate("zeitplan", (p) => {
    const x = p[v.weekday]; if (!x || x.lastPosted === v.dateKey) return false;
    x.lastPosted = v.dateKey; return true;
  }, { initial: {} });
  if (!claimed) return;
  const kickoff = viennaAt(v.y, v.mo, v.d, e.kickoff);
  if (kickoff - 60 * 60000 < now + 2 * 60000) return; // Anmeldeschluss schon vorbei
  await launchTournament({ channelId: e.channelId, name: `${e.name} · ${DAYS[v.weekday - 1]}, ${shortDate(v.mo, v.d)}`, day: DAYS[v.weekday - 1], date: shortDate(v.mo, v.d), times: timesFromKickoff(kickoff) }, { replace: true });
}

// ---------- Auslosung ----------
export async function doDraw(channelId) {
  const cfg = await getConfig(), clubs = await getClubs();
  const busy = await activeTournament();
  const { value: t, result } = await mutate(tKey(channelId), (t) => {
    if (busy && busy.channelId !== channelId && T.ACTIVE.includes(busy.status)) { t.status = "abgesagt"; return { cancelled: true, busy: true }; }
    const r = T.closeAndDraw(t);
    if (!r.cancelled) for (const c of t.playing.concat(t.wait)) t.members[c] = membersOf(clubs, c);
    return r;
  }, { missing: "Turnier nicht gefunden." });
  await refreshSignup(t);
  if (result.cancelled) {
    await sendMessage(channelId, { content: result.busy ? "⚠️ **Der Cup fällt aus** – es läuft gerade noch ein anderer Cup." : `⚠️ **Der Cup fällt heute aus** – nur ${t.reg.length} ${t.reg.length === 1 ? "Mannschaft" : "Mannschaften"} angemeldet, mindestens 8 nötig.` });
    await scheduleCleanup(t);
    return t;
  }
  await set("active", channelId);
  await sendMessage(channelId, V.drawPost(t));
  // Rollen „Gruppe X“ an Manager und Co-VM
  const ops = [];
  for (const g of t.groups) for (const c of g.teams) for (const u of t.members[c] || []) ops.push({ u, add: [cfg.roles.groups?.[g.name]], why: `Auslosung: Gruppe ${g.name}` });
  await enqueue(ops);
  // Check-in-Posts in den Gruppenkanälen
  const ids = {};
  for (const g of t.groups) {
    const ch = cfg.channels["g" + g.name];
    if (!ch) continue;
    const m = await sendMessage(ch, V.groupCheckin(t, g, cfg.roles.groups?.[g.name]));
    ids[g.name] = { checkin: m?.id ?? null, plan: null, res: null };
    const rch = cfg.channels["r" + g.name];
    if (rch) { const rm = await sendMessage(rch, V.resultPanel(t, g)); if (rm) { ids[g.name].res = rm.id; await pinMessage(rch, rm.id); } }
  }
  const live = cfg.channels.live ? await sendMessage(cfg.channels.live, V.livePlan(t)) : null;
  await mutate(tKey(channelId), (x) => { x.msgs.groups = ids; x.msgs.live = live?.id ?? null; });
  return t;
}

// ---------- Check-in ----------
export async function refreshGroupCheckin(t, gName) {
  const cfg = await getConfig();
  const g = t.groups.find((x) => x.name === gName), ch = cfg.channels["g" + gName], id = t.msgs.groups?.[gName]?.checkin;
  if (g && ch && id) await editMessage(ch, id, V.groupCheckin(t, g, cfg.roles.groups?.[gName]));
}

export async function doCheckinEnd(channelId) {
  const cfg = await getConfig(), clubs = await getClubs();
  const { value: t, result } = await mutate(tKey(channelId), (t) => {
    const r = T.finishCheckin(t);
    for (const x of r.replaced) t.members[x.new] = t.members[x.new]?.length ? t.members[x.new] : membersOf(clubs, x.new);
    r.events = T.advance(t);
    return r;
  });
  // Rollen: Nachrücker rein, Nicht-Eingecheckte raus
  const ops = [];
  for (const x of result.replaced) {
    for (const u of t.members[x.old] || []) ops.push({ u, rem: [cfg.roles.groups?.[x.group]], why: "Nicht eingecheckt" });
    for (const u of t.members[x.new] || []) ops.push({ u, add: [cfg.roles.groups?.[x.group]], why: `Nachrücker Gruppe ${x.group}` });
  }
  for (const x of result.forfeited) for (const u of t.members[x.club] || []) ops.push({ u, rem: [cfg.roles.groups?.[x.group]], why: "Nicht eingecheckt" });
  await enqueue(ops);
  const lines = [
    ...result.replaced.map((x) => `🔁 **Gruppe ${x.group}:** ${flagOf(x.old)} ${V.esc(x.old)} nicht eingecheckt → ${flagOf(x.new)} **${V.esc(x.new)}** rückt nach.`),
    ...result.forfeited.map((x) => `❌ **Gruppe ${x.group}:** ${flagOf(x.club)} ${V.esc(x.club)} nicht eingecheckt – alle Spiele werden mit 0:3 gewertet.`),
  ];
  await refreshSignup(t);
  await sendMessage(channelId, { content: `🔒 **Check-in beendet.** ${t.playing.length - t.out.length} Mannschaften sind dabei. Anpfiff um <t:${Math.floor(t.times.kickoff / 1000)}:t> – die Spielpläne stehen in euren Gruppenkanälen.${lines.length ? "\n\n" + lines.join("\n") : ""}` });
  for (const g of t.groups) {
    const ch = cfg.channels["g" + g.name]; if (!ch) continue;
    await refreshGroupCheckin(t, g.name);
    const plan = await sendMessage(ch, V.groupPlan(t, g, cfg.channels["r" + g.name]));
    if (plan) { await pinMessage(ch, plan.id); await mutate(tKey(channelId), (x) => { x.msgs.groups[g.name] = { ...(x.msgs.groups[g.name] || {}), plan: plan.id }; }); }
  }
  const fresh = await get(tKey(channelId));
  await refreshLive(fresh);
  await handleEvents(fresh, result.events);
  return fresh;
}

export async function doKickoff(channelId) {
  const cfg = await getConfig();
  const { value: t, result: first } = await mutate(tKey(channelId), (t) => { if (t.kickoffDone) return false; t.kickoffDone = true; return true; });
  if (!first) return;
  for (const g of t.groups) {
    const ch = cfg.channels["g" + g.name], role = cfg.roles.groups?.[g.name];
    if (ch) await sendMessage(ch, V.freigabePost(t, g, t.round, role, cfg.channels["r" + g.name]));
  }
}

// ---------- Ergebniskanäle ----------
/** Wo landen Ergebnis-Nachrichten? Gruppe → eigener Ergebniskanal (sonst Gruppenkanal), K.-o. → KO-Kanal */
export const resultChannelOf = (cfg, m) => (m.phase === "gruppe" ? cfg.channels["r" + m.group] || cfg.channels["g" + m.group] : cfg.channels.kor || cfg.channels.ko);

/** Ergebnis-Panel im KO-Ergebniskanal: pro Runde neu posten (damit es unten steht), sonst aktualisieren */
export async function refreshKOResultPanel(t, fresh = false) {
  const cfg = await getConfig();
  const ch = cfg.channels.kor;
  if (!ch || !t.koSize) return;
  const old = t.msgs.koRes;
  const id = fresh ? (await sendMessage(ch, V.koResultPanel(t)))?.id : await upsertMessage(ch, old, V.koResultPanel(t));
  if (fresh && old) await editMessage(ch, old, { ...V.koResultPanel({ ...t, status: "vorbei" }), components: [] });
  if (id && id !== old) { await pinMessage(ch, id); await mutate(tKey(t.channelId), (x) => { x.msgs.koRes = id; }); }
}

export async function refreshResultPanel(t, gName) {
  const cfg = await getConfig();
  const ch = cfg.channels["r" + gName], g = t.groups.find((x) => x.name === gName);
  if (!ch || !g) return;
  const old = t.msgs.groups?.[gName]?.res;
  const id = await upsertMessage(ch, old, V.resultPanel(t, g));
  if (id && id !== old) { await pinMessage(ch, id); await mutate(tKey(t.channelId), (x) => { x.msgs.groups[gName] = { ...(x.msgs.groups[gName] || {}), res: id }; }); }
}

// ---------- Größenvideos ----------
export async function postVideoRequest(t, v, m) {
  const cfg = await getConfig();
  const ch = resultChannelOf(cfg, m);
  if (!ch) return;
  const msg = await sendMessage(ch, V.videoPost(v, t.members[v.to] || []));
  if (msg) await mutate(tKey(t.channelId), (x) => { const y = x.videos.find((z) => z.id === v.id); if (y) { y.msg = msg.id; y.ch = ch; } });
}
export async function videoSubmitted(t, v) {
  if (v.ch && v.msg) await editMessage(v.ch, v.msg, V.videoPost(v, []));
  const users = t.members[v.by] || [];
  if (v.ch) await sendMessage(v.ch, { content: `${users.map((u) => `<@${u}>`).join(" ")} ${v.status === "verspaetet" ? "🕓" : "✅"} **${V.esc(v.to)}** hat das Größenvideo${v.status === "verspaetet" ? " verspätet" : ""} eingereicht: ${v.link}`, allowed_mentions: { users } });
}
// ---------- Aktualisieren ----------
export async function refreshLive(t) {
  const cfg = await getConfig();
  if (!cfg.channels.live) return;
  const id = await upsertMessage(cfg.channels.live, t.msgs.live, V.livePlan(t));
  if (id && id !== t.msgs.live) await mutate(tKey(t.channelId), (x) => { x.msgs.live = id; });
}
export async function refreshGroupPlan(t, gName) {
  const cfg = await getConfig();
  const g = t.groups.find((x) => x.name === gName), ch = cfg.channels["g" + gName], id = t.msgs.groups?.[gName]?.plan;
  if (g && ch && id) await editMessage(ch, id, V.groupPlan(t, g, cfg.channels["r" + gName]));
  await refreshResultPanel(t, gName);
}
export async function refreshBracket(t) {
  const cfg = await getConfig();
  if (!cfg.channels.ko || !t.koSize) return;
  const id = await upsertMessage(cfg.channels.ko, t.msgs.bracket, V.bracket(t));
  if (id && id !== t.msgs.bracket) await mutate(tKey(t.channelId), (x) => { x.msgs.bracket = id; });
}

// ---------- Ergebnisse ----------
export async function afterResult(t, m, events, byAdmin = false) {
  const cfg = await getConfig();
  const ch = resultChannelOf(cfg, m);
  if (ch) await sendMessage(ch, V.resultConfirmed(m, byAdmin));
  await closeAsk(t, m, m.auto ? "auto" : "bestaetigt");
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group); else { await refreshBracket(t); if (!events?.length) await refreshKOResultPanel(t); }
  await refreshLive(t);
  await handleEvents(t, events);
}

export async function askOpponent(t, m, reporterClub, h, a, pen) {
  const cfg = await getConfig();
  const opp = reporterClub === m.home ? m.away : m.home;
  const ch = resultChannelOf(cfg, m);
  if (!ch) return;
  const msg = await sendMessage(ch, V.confirmAsk(m, reporterClub, t.members[opp] || [], h, a, pen));
  if (msg) await mutate(tKey(t.channelId), (x) => { const y = x.matches.find((z) => z.id === m.id); if (y) y.ask = { ch, id: msg.id, by: reporterClub, h, a, pen }; });
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group); else await refreshKOResultPanel(t);
}

/** Bestätigungs-Nachricht abschließen (Buttons weg) */
async function closeAsk(t, m, state) {
  const fresh = (await get(tKey(t.channelId)))?.matches.find((z) => z.id === m.id);
  const ask = fresh?.ask;
  if (!ask) return;
  await editMessage(ask.ch, ask.id, V.confirmAsk(m, ask.by, [], ask.h, ask.a, ask.pen, state));
}

/** Vom Timer: Ergebnisse nach 2 Minuten ohne Reaktion automatisch bestätigen */
export async function runAutoConfirm() {
  const t0 = await activeTournament();
  if (!t0 || !["gruppen", "ko"].includes(t0.status)) return;
  const { value: t, result } = await mutate(tKey(t0.channelId), (t) => {
    const ids = T.autoConfirm(t);
    return { ids, events: ids.length ? T.advance(t) : [] };
  });
  for (let k = 0; k < result.ids.length; k++) {
    const m = t.matches.find((x) => x.id === result.ids[k]);
    await afterResult(t, m, k === result.ids.length - 1 ? result.events : []);
  }
}

export async function notifyConflict(t, m) {
  const cfg = await getConfig();
  const ch = cfg.channels.log || resultChannelOf(cfg, m);
  const role = cfg.roles.turnierleitung;
  const line = (c) => { const r = m.reports[c]; return `• ${flagOf(c)} ${V.esc(c)} meldet **${r.h}:${r.a}${r.pen ? ` (${r.pen[0]}:${r.pen[1]} i.E.)` : ""}**`; };
  await closeAsk(t, m, "konflikt");
  if (ch) await sendMessage(ch, { content: `${role ? `<@&${role}> ` : ""}⚠️ **Ergebnis-Konflikt bei Spiel #${m.id}** (${V.esc(m.home)} – ${V.esc(m.away)})\n${line(m.home)}\n${line(m.away)}\nLösen: beide melden neu, oder \`/cl-admin ergebnis spiel:${m.id}\`.`, allowed_mentions: { roles: role ? [role] : [] } });
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group);
}

// ---------- Phasenwechsel ----------
async function handleEvents(t, events) {
  const cfg = await getConfig();
  for (const e of events || []) {
    if (e.type === "spieltag") {
      for (const g of t.groups) {
        const ch = cfg.channels["g" + g.name], role = cfg.roles.groups?.[g.name];
        await refreshGroupPlan(t, g.name);
        if (ch && t.matches.some((m) => m.group === g.name && m.round === e.round)) await sendMessage(ch, V.freigabePost(t, g, e.round, role, cfg.channels["r" + g.name]));
      }
    }
    if (e.type === "ko-start") await startKOSideEffects(t, cfg);
    if (e.type === "ko-runde") await koRoundSideEffects(t, cfg, e);
    if (e.type === "finish") await finishCup(t, cfg);
  }
  if (events?.length) await refreshLive(await get(tKey(t.channelId)));
}

async function startKOSideEffects(t, cfg) {
  const ops = [];
  const groupRoles = Object.values(cfg.roles.groups || {});
  for (const c of t.playing) for (const u of t.members[c] || []) ops.push({ u, rem: groupRoles, why: "Gruppenphase beendet" });
  for (const c of t.qualified) { const r = T.koRoleOf(t, c); for (const u of t.members[c] || []) ops.push({ u, add: [cfg.roles.rounds?.[r]], why: `K.-o.-Phase: ${r}` }); }
  await enqueue(ops);
  for (const g of t.groups) await refreshGroupPlan(t, g.name);
  await sendMessage(t.channelId, { content: `⭐ **Die Gruppenphase ist beendet!** ${t.koSize} Mannschaften stehen im ${T.koRoundName(t, 1)}.` });
  if (cfg.channels.ko) await sendMessage(cfg.channels.ko, V.koRoundPost(t, t.members, cfg.roles.rounds || {}, cfg.channels.kor));
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)), true);
}

async function koRoundSideEffects(t, cfg, e) {
  const all = Object.values(cfg.roles.rounds || {});
  const ops = [];
  const now = new Set(T.currentMatches(t).flatMap((m) => [m.home, m.away]));
  for (const c of e.losers) if (!now.has(c)) for (const u of t.members[c] || []) ops.push({ u, rem: all, why: "Ausgeschieden" });
  for (const c of now) { const r = T.koRoleOf(t, c); for (const u of t.members[c] || []) ops.push({ u, add: [cfg.roles.rounds?.[r]], rem: all.filter((x) => x !== cfg.roles.rounds?.[r]), why: `K.-o.: ${r}` }); }
  await enqueue(ops);
  if (cfg.channels.ko) await sendMessage(cfg.channels.ko, V.koRoundPost(t, t.members, cfg.roles.rounds || {}, cfg.channels.kor));
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)), true);
}

async function finishCup(t, cfg) {
  const all = Object.values(cfg.roles.rounds || {});
  const ops = [];
  for (const c of t.qualified || []) for (const u of t.members[c] || []) ops.push({ u, rem: all, why: "Turnier beendet" });
  await enqueue(ops);
  // Statistik: alle eingecheckten Mannschaften haben gespielt
  const today = todayKey();
  let titleNo = 1;
  await mutate("clubs", (clubs) => {
    for (const c of t.checked) if (clubs[c]) { clubs[c].cups = (clubs[c].cups || 0) + 1; clubs[c].lastPlayed = today; clubs[c].warned = null; }
    if (clubs[t.champion]) { clubs[t.champion].titles = (clubs[t.champion].titles || 0) + 1; titleNo = clubs[t.champion].titles; }
  }, { initial: {} });
  await set("active", null);
  await scheduleCleanup(t);
  const TR = await import("./trophies.mjs");
  await TR.recordCup(t);
  await TR.refreshTrophyPanel();
  const f = t.matches.find((m) => m.final && m.round === t.koRound);
  const finalLine = `${f.home} ${f.h}:${f.a}${f.pen ? ` (${f.pen[0]}:${f.pen[1]} i.E.)` : ""} ${f.away}`;
  await sendMessage(t.channelId, { content: `🏆 **Das Turnier ist beendet!** Glückwunsch an ${flagOf(t.champion)} **${V.esc(t.champion)}**!${cfg.channels.hof ? ` Das Siegerbild steht in <#${cfg.channels.hof}>.` : ""}` });
  if (cfg.channels.ko) await sendMessage(cfg.channels.ko, { content: "🏆 **Das Turnier ist beendet!** Alle Runden-Rollen werden entfernt." });
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)));
  await refreshSignup(t);
  if (cfg.channels.hof) {
    const names = await displayNames(t.podium.map((c) => (t.members[c] || [])[0]).filter(Boolean));
    const { hallOfFameImage } = await import("./image.mjs"); // erst hier laden, damit der Bot auch ohne Bild-Modul startet
    const img = await hallOfFameImage({
      podium: t.podium.map((c) => ({ club: c, mgr: names[(t.members[c] || [])[0]] || "" })),
      title: t.name, sub: `${t.fmt}er-Format · Finale: ${finalLine}`, seed: Date.now() % 1000,
    }).catch((e) => { console.error("Siegerbild:", e); return null; });
    const text = V.hofText(t, t.members, titleNo, finalLine);
    if (img) await sendWithFile(cfg.channels.hof, text, "hall-of-fame.png", img); else await sendMessage(cfg.channels.hof, text);
  }
}

async function displayNames(ids) {
  const { discord } = await import("./discord.mjs");
  const out = {};
  for (const id of ids) {
    const m = await discord(`/guilds/${process.env.DISCORD_GUILD_ID}/members/${id}`);
    out[id] = m?.nick || m?.user?.global_name || m?.user?.username || "";
  }
  return out;
}

/** Turnier abbrechen (Turnierleitung): Rollen weg, Status „abgebrochen“. */
export async function cancelTournament(channelId) {
  const cfg = await getConfig();
  const { value: t } = await mutate(tKey(channelId), (t) => { t.status = "geloescht"; });
  const roles = [...Object.values(cfg.roles.groups || {}), ...Object.values(cfg.roles.rounds || {})];
  const ops = [];
  for (const c of Object.keys(t.members || {})) for (const u of t.members[c]) ops.push({ u, rem: roles, why: "Turnier abgebrochen" });
  await enqueue(ops);
  if ((await get("active")) === channelId) await set("active", null);
  await refreshSignup(t);
  await scheduleCleanup(t);
  return t;
}

/** Zeitgesteuerte Schritte eines Turniers (vom Timer jede Minute aufgerufen) */
export async function runTimers(t, now = Date.now()) {
  if (t.status === "anmeldung" && now >= t.times.close) return doDraw(t.channelId);
  if (t.status === "checkin" && now >= t.times.checkinEnd) return doCheckinEnd(t.channelId);
  if (t.status === "gruppen" && !t.kickoffDone && now >= t.times.kickoff) return doKickoff(t.channelId);
}

export async function allTournaments() {
  const ks = await keys("t:");
  return (await Promise.all(ks.map((k) => get(k)))).filter(Boolean);
}

export { ROUND_ROLES };
