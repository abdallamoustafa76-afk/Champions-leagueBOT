// Läuft jede Minute: sammelt während des Cups die Spielerwerte aus EA FC Pro Clubs und postet nach dem Finale das TOTT.
// Eigene Funktion (nicht im tick), damit langsame EA-Antworten den restlichen Bot nicht ausbremsen.
// Ausschalten: Umgebungsvariable EA_AUTO=0 setzen.
import { runEaCheck } from "../lib/eaflow.mjs";

export default async () => {
  try { await runEaCheck(22000); } catch (e) { console.error("EA-Check:", e?.message || e); }
};

export const config = { schedule: "* * * * *" };
