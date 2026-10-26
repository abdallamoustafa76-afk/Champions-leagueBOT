// Läuft jede Minute: Wochenplan, Turnier-Zeitpunkte, Rollen-Abgleich, Inaktivität, Rollen-Warteschlange.
import { runSchedule, runTimers, allTournaments, runAutoConfirm } from "../lib/flow.mjs";
import { syncManagerRoles, dailyInactivity, welcomeNewMembers } from "../lib/maintenance.mjs";
import { listMembers } from "../lib/discord.mjs";
import { processQueue } from "../lib/roles.mjs";
import { expireBans } from "../lib/bans.mjs";
import { runAutoDelete } from "../lib/notify.mjs";
import { processSetupJobs } from "../lib/autosetup.mjs";

export default async () => {
  const start = Date.now();
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`${name}:`, e?.message || e); } };
  await step("Einrichtung", () => processSetupJobs(9000));
  await step("Wochenplan", () => runSchedule());
  await step("Turniere", async () => {
    for (const t of await allTournaments()) if (["anmeldung", "checkin", "gruppen"].includes(t.status)) await step(`Turnier ${t.channelId}`, () => runTimers(t));
  });
  await step("Ergebnisse automatisch bestätigen", () => runAutoConfirm());
  let members = null;
  await step("Mitglieder laden", async () => { members = await listMembers(); });
  await step("Rollen-Abgleich", () => syncManagerRoles(members));
  await step("Willkommen", () => welcomeNewMembers(members));
  await step("Inaktivität", () => dailyInactivity());
  await step("Sperren", () => expireBans());
  await step("Benachrichtigungen löschen", () => runAutoDelete());
  await step("Rollen-Warteschlange", () => processQueue(Math.max(3000, 26000 - (Date.now() - start))));
};

export const config = { schedule: "* * * * *" };
