// Läuft jede Minute: Wochenplan, Turnier-Zeitpunkte, Rollen-Abgleich, Inaktivität, Rollen-Warteschlange.
import { runSchedule, runTimers, allTournaments, runAutoConfirm } from "../lib/flow.mjs";
import { syncManagerRoles, dailyInactivity, welcomeNewMembers } from "../lib/maintenance.mjs";
import { listMembers } from "../lib/discord.mjs";
import { processQueue } from "../lib/roles.mjs";
import { expireBans } from "../lib/bans.mjs";
import { runAutoDelete } from "../lib/notify.mjs";
import { processSetupJobs } from "../lib/autosetup.mjs";
import { runCleanup } from "../lib/cleanup.mjs";

export default async () => {
  const start = Date.now();
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`${name}:`, e?.message || e); } };
  // Mitglieder zuerst laden und begrüßen, damit die Willkommensnachricht nicht hinter langen Schritten wartet
  let members = null;
  await step("Mitglieder laden", async () => { members = await listMembers(); });
  await step("Willkommen", () => welcomeNewMembers(members));
  await step("Einrichtung", () => processSetupJobs(9000));
  await step("Wochenplan", () => runSchedule());
  await step("Turniere", async () => {
    for (const t of await allTournaments()) if (["anmeldung", "checkin", "gruppen"].includes(t.status)) await step(`Turnier ${t.channelId}`, () => runTimers(t));
  });
  await step("Ergebnisse automatisch bestätigen", () => runAutoConfirm());
  await step("Rollen-Abgleich", () => syncManagerRoles(members));
  await step("Inaktivität", () => dailyInactivity());
  await step("Sperren", () => expireBans());
  await step("Benachrichtigungen löschen", () => runAutoDelete());
  await step("Aufräumen nach dem Cup", () => runCleanup(8000));
  await step("Rollen-Warteschlange", () => processQueue(Math.max(3000, 26000 - (Date.now() - start))));
};

export const config = { schedule: "* * * * *" };
