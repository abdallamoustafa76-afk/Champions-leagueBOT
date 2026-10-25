// Läuft jede Minute: Wochenplan, Turnier-Zeitpunkte, Rollen-Abgleich, Inaktivität, Rollen-Warteschlange.
import { runSchedule, runTimers, allTournaments, runAutoConfirm } from "../lib/flow.mjs";
import { syncManagerRoles, dailyInactivity } from "../lib/maintenance.mjs";
import { processQueue } from "../lib/roles.mjs";
import { expireBans } from "../lib/bans.mjs";

export default async () => {
  const start = Date.now();
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`${name}:`, e?.message || e); } };
  await step("Wochenplan", () => runSchedule());
  await step("Turniere", async () => {
    for (const t of await allTournaments()) if (["anmeldung", "checkin", "gruppen"].includes(t.status)) await step(`Turnier ${t.channelId}`, () => runTimers(t));
  });
  await step("Ergebnisse automatisch bestätigen", () => runAutoConfirm());
  await step("Rollen-Abgleich", () => syncManagerRoles());
  await step("Inaktivität", () => dailyInactivity());
  await step("Sperren", () => expireBans());
  await step("Rollen-Warteschlange", () => processQueue(Math.max(3000, 26000 - (Date.now() - start))));
};

export const config = { schedule: "* * * * *" };
