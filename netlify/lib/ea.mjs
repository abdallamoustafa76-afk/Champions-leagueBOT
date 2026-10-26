// Zugriff auf die inoffizielle EA-Pro-Clubs-API (dieselben Endpunkte, die proclubs.ea.com im Browser nutzt).
// „impit“ lässt die Anfragen auf TLS-Ebene wie Chrome aussehen – normales fetch() wird von EAs Bot-Schutz blockiert.
// Übernommen und angepasst aus dem Zusagen-Bot (match-core.js / proclubs-stats.js). Wird nur fürs TOTT genutzt.

const EA_BASE = "https://proclubs.ea.com/api/fc";
export const PLATFORM = process.env.EA_PLATFORM || "common-gen5"; // common-gen5 = PS5/Xbox Series/PC

let impit = null;
async function client() {
  if (!impit) {
    const { Impit } = await import("impit"); // erst bei Bedarf laden
    impit = new Impit({ browser: "chrome" });
  }
  return impit;
}

export async function eaFetch(path, timeoutMs = 8000) {
  const c = await client();
  const res = await c.fetch(`${EA_BASE}${path}`, {
    headers: { Accept: "application/json", Referer: "https://www.ea.com/" },
    timeout: timeoutMs,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EA antwortet mit Status ${res.status}`);
  try { return JSON.parse(text); } catch { throw new Error("EA hat keine gültigen Daten geliefert"); }
}

const norm = (s) => String(s ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * EA-Club per Name suchen. Rückgabe: { id, name } oder null.
 * Nimmt einen exakten Namens-Treffer; gibt es keinen, aber genau ein Ergebnis, dann dieses.
 */
export async function searchClub(name) {
  const data = await eaFetch(`/allTimeLeaderboard/search?platform=${PLATFORM}&clubName=${encodeURIComponent(name)}`);
  const list = (Array.isArray(data) ? data : data?.clubs || Object.values(data || {}))
    .map((c) => ({ id: String(c.clubId ?? c.clubInfo?.clubId ?? ""), name: c.clubName ?? c.name ?? c.clubInfo?.name ?? "" }))
    .filter((c) => c.id);
  const exact = list.filter((c) => norm(c.name) === norm(name));
  if (exact.length >= 1) return exact[0];
  if (list.length === 1) return list[0];
  return null;
}

/** Letzte Freundschafts- und Ligaspiele eines Clubs, neueste zuerst. Cups zwischen Clubs laufen als Freundschaftsspiele. */
export async function recentMatches(clubId, count = 5) {
  const get = (type) => eaFetch(`/clubs/matches?platform=${PLATFORM}&clubIds=${clubId}&matchType=${type}&maxResultCount=${count}`).catch(() => []);
  const [friendly, league] = await Promise.all([get("friendlyMatch"), get("leagueMatch")]);
  return [...(Array.isArray(friendly) ? friendly : []), ...(Array.isArray(league) ? league : [])]
    .filter((m) => m && m.clubs)
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
}

export const matchIdOf = (m) => String(m.matchId ?? m.match_id ?? m.timestamp);
export const goalsOf = (m, clubId) => Number(m.clubs?.[clubId]?.score ?? m.clubs?.[clubId]?.goals ?? 0) || 0;

/** Sucht in einer Spielliste das Spiel zwischen zwei EA-Clubs (neuer als `sinceMs`, nicht schon benutzt). */
export function findMatchBetween(list, idA, idB, sinceMs, used = []) {
  return list.find((m) => {
    const ids = Object.keys(m.clubs || {});
    return ids.includes(String(idA)) && ids.includes(String(idB))
      && Number(m.timestamp) * 1000 >= sinceMs
      && !used.includes(matchIdOf(m));
  }) || null;
}

// ---------- Spielerdaten für das TOTT ----------
/**
 * Spieler beider Mannschaften aus einem EA-Spiel, zugeordnet zu unseren Turnier-Vereinen.
 * Rückgabe: [{ club, name, pos, goals, assists, rating, mom, cs }]  (cs = zu null gespielt)
 */
export function playersOf(eaMatch, sides) {
  const out = [];
  for (const { club, eaId, oppEaId } of sides) {
    const conceded = goalsOf(eaMatch, String(oppEaId));
    for (const p of Object.values(eaMatch.players?.[String(eaId)] || {})) {
      const rating = Number.parseFloat(p.rating);
      out.push({
        club,
        name: String(p.playername || "Unbekannt"),
        pos: String(p.pos || "").toLowerCase(),
        goals: Number(p.goals) || 0,
        assists: Number(p.assists) || 0,
        rating: Number.isFinite(rating) ? rating : null,
        mom: String(p.mom) === "1",
        cs: conceded === 0,
      });
    }
  }
  return out;
}
