// Einmal im Browser aufrufen: https://DEINE-SEITE.netlify.app/api/setup?key=DEIN_SETUP_KEY
import { BASE_CHANNEL_TYPES } from "../lib/data.mjs";

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((name, i) => ({ name, value: i + 1 }));
const tag = { type: 4, name: "tag", description: "Wochentag", required: true, choices: DAYS };

const COMMANDS = [
  {
    name: "cl-einrichten", description: "Bot einrichten (Turnierleitung)",
    options: [
      { type: 1, name: "alles", description: "Alles auf einmal: Rollen, Kanäle erkennen/anlegen, Rechte, Wochenplan, Panels", options: [
        { type: 3, name: "anpfiff", description: "Anpfiff für alle Tage, z. B. 20:00 (Standard)" },
        { type: 5, name: "fehlende_erstellen", description: "Fehlende Kanäle automatisch anlegen (Standard: ja)" },
        { type: 5, name: "rechte_setzen", description: "Rechte der Kanäle automatisch setzen (Standard: ja)" },
      ] },
      { type: 1, name: "schrift", description: "Alle Kanalnamen des Servers in die fette Schrift umstellen (𝐁𝐞𝐢𝐬𝐩𝐢𝐞𝐥)" },
      { type: 1, name: "rechte", description: "Nur die Rechte aller verknüpften Kanäle neu setzen (Wochenplan bleibt unverändert)" },
      { type: 1, name: "kanal", description: "Einen Kanal verknüpfen", options: [
        { type: 3, name: "typ", description: "Welcher Kanal?", required: true, choices: Object.entries(BASE_CHANNEL_TYPES).map(([value, name]) => ({ name, value })) },
        { type: 7, name: "kanal", description: "Leer lassen = der Kanal, in dem du gerade schreibst", required: false, channel_types: [0, 5] },
      ] },
      { type: 1, name: "gruppe", description: "Gruppenkanal oder Ergebniskanal einer Gruppe verknüpfen", options: [
        { type: 3, name: "gruppe", description: "Welche Gruppe?", required: true, choices: ["A", "B", "C", "D", "E", "F", "G", "H"].map((g) => ({ name: "Gruppe " + g, value: g })) },
        { type: 3, name: "art", description: "Welcher Kanal der Gruppe?", required: true, choices: [{ name: "Gruppenkanal (Check-in & Spielplan)", value: "gruppe" }, { name: "Ergebniskanal", value: "ergebnisse" }] },
        { type: 7, name: "kanal", description: "Leer lassen = der Kanal, in dem du gerade schreibst", required: false, channel_types: [0, 5] },
      ] },
      { type: 1, name: "rollen", description: "Rollen verknüpfen bzw. fehlende anlegen" },
      { type: 1, name: "zurücksetzen", description: "Einrichtung (oder alles) zurücksetzen – mit Sicherheitsabfrage", options: [
        { type: 3, name: "umfang", description: "Was soll zurückgesetzt werden?", required: true, choices: [
          { name: "Nur Statistik (Trophäenhalle, Titel & Cups)", value: "stats" },
          { name: "Nur Einrichtung (Kanäle, Wochenplan, Panels)", value: "setup" },
          { name: "Alles (auch Vereine, Sperren, Turniere, Regeln)", value: "all" },
        ] },
      ] },
      { type: 1, name: "panels", description: "Panels posten: Regelwerk, Rollenauswahl, Registrieren, Meine Mannschaft, Übersicht, Sperrliste" },
      { type: 1, name: "status", description: "Zeigen, was schon eingerichtet ist" },
    ],
  },
  {
    name: "cl-zeitplan", description: "Wochenplan: jeden Tag automatisch eine Anmeldeliste (Turnierleitung)",
    options: [
      { type: 1, name: "setzen", description: "Tag einstellen oder ändern", options: [
        tag,
        { type: 3, name: "anpfiff", description: "Anpfiff, z. B. 20:00 (Anmeldeschluss 60 Min. vorher, Check-in-Ende 5 Min. vorher)", required: true },
        { type: 7, name: "kanal", description: "Leer lassen = der Kanal, in dem du gerade schreibst", required: false, channel_types: [0, 5] },
        { type: 3, name: "posten", description: "Uhrzeit, zu der die Liste gepostet wird (Standard: 12:00)" },
        { type: 3, name: "name", description: "Turniername (Standard: Champions League)", max_length: 40 },
      ] },
      { type: 1, name: "woche", description: "Ab einem Datum jeden Tag Cup: alle 7 Listen sofort posten, danach immer 1 Woche im Voraus", options: [
        { type: 3, name: "start", description: "Erster Cup-Tag, z. B. 29.10.2026", required: true },
        { type: 3, name: "anpfiff", description: "Anpfiff jeden Tag (Standard: 20:00)", required: false },
        { type: 3, name: "posten", description: "Uhrzeit, zu der nach dem Cup die Liste für nächste Woche kommt (Standard: 23:00)", required: false },
        { type: 3, name: "name", description: "Turniername (Standard: Champions League)", required: false, max_length: 40 },
      ] },
      { type: 1, name: "anzeigen", description: "Wochenplan anzeigen" },
      { type: 1, name: "entfernen", description: "Tag entfernen", options: [tag] },
      { type: 1, name: "jetzt-posten", description: "Liste für diesen Tag sofort posten (z. B. zum Testen)", options: [tag] },
    ],
  },
  {
    name: "cl-turnier", description: "Einmaliges Turnier im aktuellen Kanal erstellen (Turnierleitung)",
    options: [
      { type: 3, name: "name", description: "Name des Turniers", required: true, max_length: 60 },
      { type: 3, name: "anpfiff", description: "Anpfiff, z. B. 31.10.2026 20:00", required: true },
      { type: 5, name: "nur_mit_ticket", description: "Sonderturnier (z. B. Cash Cup): Anmelden nur mit Sonderturnier-Ticket aus dem Shop", required: false },
    ],
  },
  { name: "cl-ergebnis", description: "Ergebnis deines Spiels melden" },
  {
    name: "cl-bewerbung", description: "Staff-Bewerbungen öffnen oder schließen (nur Server-Admins)",
    options: [
      { type: 1, name: "öffnen", description: "Bewerbungen annehmen" },
      { type: 1, name: "schließen", description: "Keine neuen Bewerbungen mehr annehmen" },
    ],
  },
  {
    name: "cl-admin", description: "Werkzeuge für die Turnierleitung",
    options: [
      { type: 1, name: "anmeldeschluss", description: "Anmeldung in diesem Kanal sofort schließen und auslosen" },
      { type: 1, name: "checkin-ende", description: "Check-in sofort beenden" },
      { type: 1, name: "spiele", description: "Offene Spiele und Meldungen anzeigen" },
      { type: 1, name: "ergebnis", description: "Ergebnis festlegen oder korrigieren", options: [
        { type: 4, name: "spiel", description: "Spiel-Nr. (siehe /cl-admin spiele)", required: true, min_value: 1 },
        { type: 4, name: "heim", description: "Tore Heim", required: true, min_value: 0, max_value: 99 },
        { type: 4, name: "gast", description: "Tore Gast", required: true, min_value: 0, max_value: 99 },
        { type: 3, name: "elfmeter", description: "Nur K.-o. bei Unentschieden, z. B. 4:3" },
      ] },
      { type: 1, name: "freilos-hinzufügen", description: "Ein Freilos in die Anmeldeliste dieses Kanals setzen" },
      { type: 1, name: "freilos-entfernen", description: "Ein Freilos aus der Anmeldeliste dieses Kanals entfernen" },
      { type: 1, name: "abbrechen", description: "Laufendes Turnier abbrechen und Rollen entfernen" },
      { type: 1, name: "ea-verknüpfen", description: "EA-Club eines Vereins neu suchen oder die EA-Club-ID direkt eintragen", options: [
        { type: 3, name: "verein", description: "Vereinsname genau wie in der Übersicht", required: true },
        { type: 3, name: "ea_id", description: "EA-Club-ID (leer lassen = per Name suchen)", required: false, max_length: 12 },
      ] },
      { type: 1, name: "ea-status", description: "TOTT: Zeigen, welche Mannschaften mit EA verknüpft sind und wie viele Daten gesammelt wurden" },
      { type: 1, name: "tott", description: "TOTT des letzten Turniers sofort (neu) posten" },
      { type: 1, name: "coins", description: "Coins in eine Vereinskasse geben (+) oder abziehen (−)", options: [
        { type: 3, name: "verein", description: "Vereinsname genau wie in der Übersicht", required: true },
        { type: 4, name: "betrag", description: "z. B. 50 oder -50", required: true, min_value: -100000, max_value: 100000 },
        { type: 3, name: "grund", description: "Grund (steht in den Buchungen)", required: false, max_length: 100 },
      ] },
      { type: 1, name: "testcup-start", description: "Test-Cup allein testen: deine Mannschaft + Test-Teams, ohne Statistik", options: [
        { type: 4, name: "teams", description: "Anzahl Teams (8 = mit Halbfinale, 16 = mit Viertelfinale)", required: false, choices: [{ name: "8 Teams", value: 8 }, { name: "16 Teams", value: 16 }] },
      ] },
      { type: 1, name: "testcup-weiter", description: "Spiele zwischen Test-Teams sofort ausspielen" },
      { type: 1, name: "rollen-check", description: "Prüfen, ob alle Cup-Teilnehmer die richtigen Gruppen-/KO-Rollen haben, und korrigieren" },
      { type: 1, name: "willkommen-test", description: "Willkommensnachricht testweise für dich selbst posten" },
      { type: 1, name: "verein-freigeben", description: "Einen Verein freigeben (z. B. bei Streit)", options: [
        { type: 3, name: "verein", description: "Vereinsname genau wie in der Übersicht", required: true },
      ] },
    ],
  },
];

export default async (req) => {
  const key = new URL(req.url).searchParams.get("key");
  const text = (s, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) return text("❌ Falscher oder fehlender Schlüssel.", 401);
  const { DISCORD_APP_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } = process.env;
  const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands`, {
    method: "PUT", headers: { Authorization: `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(COMMANDS),
  });
  return res.ok ? text(`✅ ${COMMANDS.length} Befehle registriert. Du kannst die Seite schließen.`) : text(`❌ Fehler ${res.status}: ${await res.text()}`, 500);
};

export const config = { path: "/api/setup" };
export { COMMANDS };
