// Hintergrund-Aufgaben: Manager-Rolle ↔ Spieler-Rolle abgleichen, 7-Tage-Inaktivität.
import { get, set, mutate, getConfig, getClubs } from "./store.mjs";
import { listMembers, sendMessage } from "./discord.mjs";
import { notify } from "./notify.mjs";
import { welcomePost } from "./views.mjs";
import { enqueue } from "./roles.mjs";
import { releaseClub, refreshOverview } from "./flow.mjs";
import { viennaParts, todayKey, daysBetween } from "./time.mjs";
import { INACTIVE_DAYS, COLOR, flagOf } from "./data.mjs";

/**
 * Wer die Manager-Rolle bekommt, verliert die Spieler-Rolle.
 * Wem die Manager-Rolle weggenommen wird, bekommt die Spieler-Rolle zurück –
 * sein Verein geht an den Co-VM (oder wird frei), als Co-VM wird er ausgetragen.
 */
export async function syncManagerRoles(members) {
  const cfg = await getConfig();
  const M = cfg.roles.manager, P = cfg.roles.spieler;
  if (!M || !P) return;
  members = members ?? (await listMembers());
  if (!members) return; // „Server Members Intent“ nicht aktiv
  const byId = new Map(members.map((m) => [m.user.id, m]));
  const now = new Set(members.filter((m) => m.roles.includes(M)).map((m) => m.user.id));
  const prev = await get("managers");
  const ops = [];
  for (const id of now) if (byId.get(id).roles.includes(P)) ops.push({ u: id, rem: [P], why: "Manager-Rolle erhalten" });
  const removed = prev ? prev.filter((id) => !now.has(id)) : [];
  for (const id of removed) {
    const m = byId.get(id);
    if (m && !m.roles.includes(P) && !m.user.bot) ops.push({ u: id, add: [P], why: "Manager-Rolle entfernt" });
  }
  await enqueue(ops);
  await set("managers", [...now]);
  if (!removed.length) return;
  const clubs = await getClubs();
  for (const id of removed) {
    for (const [name, c] of Object.entries(clubs)) {
      if (c.manager === id) await releaseClub(name, { transferToCo: true, reason: "Manager-Rolle wurde entfernt" });
      else if (c.co === id) { await mutate("clubs", (cl) => { if (cl[name]?.co === id) cl[name].co = null; }, { initial: {} }); await refreshOverview(); }
    }
  }
}

/** Einmal täglich: Warnung an Tag 5 und 6, Reset nach 7 Tagen ohne Cup. */
export async function dailyInactivity(now = Date.now()) {
  const v = viennaParts(now);
  if (v.hhmm < "00:05") return;
  const today = todayKey(now);
  const { result: run } = await mutate("daily", (d) => { if (d.last === today) return false; d.last = today; return true; }, { initial: {} });
  if (!run) return;
  const clubs = await getClubs();
  for (const [name, c] of Object.entries(clubs)) {
    const last = c.lastPlayed || today;
    const days = daysBetween(last, today);
    const users = [c.manager, c.co].filter(Boolean);
    if (days >= INACTIVE_DAYS) {
      await releaseClub(name, { reason: `${INACTIVE_DAYS} Tage keinen Cup gespielt` });
      await notify(users, { embeds: [{ color: COLOR, title: `${flagOf(name)} Mannschaft zurückgesetzt`, description: `Ihr habt ${INACTIVE_DAYS} Tage keinen Cup gespielt. **${name}** ist jetzt wieder frei. Du kannst dir jederzeit eine neue Mannschaft nehmen.` }] });
    } else if (days === INACTIVE_DAYS - 2 || days === INACTIVE_DAYS - 1) {
      await notify(users, { embeds: [{ color: COLOR, title: `⚠️ ${days === INACTIVE_DAYS - 2 ? "Erinnerung" : "Letzte Warnung"}: ${name}`, description: `Ihr habt seit **${days} Tagen** keinen Cup gespielt. ${days === INACTIVE_DAYS - 2 ? "In 2 Tagen" : "Morgen"} wird eure Mannschaft zurückgesetzt und ist dann für andere frei. Spielt einen Cup mit, dann startet der Zähler neu.` }] });
    }
  }
}

/** Neue Mitglieder begrüßen (Mitgliederliste wird jede Minute verglichen) */
export async function welcomeNewMembers(members) {
  const cfg = await getConfig();
  if (!members) return;
  const ids = members.filter((m) => !m.user.bot).map((m) => m.user.id);
  const known = await get("knownMembers");
  await set("knownMembers", ids);
  if (!known || !cfg.channels.welcome) return; // erster Lauf: nur merken, niemanden begrüßen
  const old = new Set(known);
  const fresh = ids.filter((id) => !old.has(id)).slice(0, 10);
  for (const id of fresh) await sendMessage(cfg.channels.welcome, welcomePost(id, cfg.channels));
}
