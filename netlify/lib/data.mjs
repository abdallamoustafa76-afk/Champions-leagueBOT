// Feste Daten: Ligen, Vereine, Formate, Farben.

export const COLOR = 0x2f7bff; // alle Embed-Ränder blau

export const LEAGUES = [
  { name: "Premier League", code: "EN", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", clubs: ["Arsenal", "Aston Villa", "AFC Bournemouth", "FC Brentford", "Brighton", "Chelsea", "Crystal Palace", "Everton", "Fulham", "Leeds United", "Leicester City", "Liverpool", "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest", "AFC Sunderland", "Tottenham Hotspur", "West Ham United", "Wolverhampton"] },
  { name: "LaLiga", code: "ES", flag: "🇪🇸", clubs: ["Real Madrid", "FC Barcelona", "Atlético Madrid", "Athletic Bilbao", "Real Sociedad", "Villarreal", "Real Betis", "FC Sevilla", "FC Valencia", "Girona", "Celta Vigo", "Osasuna", "Rayo Vallecano", "RCD Mallorca", "Getafe", "Espanyol", "Deportivo Alavés", "Real Oviedo", "Elche", "UD Las Palmas"] },
  { name: "Serie A", code: "IT", flag: "🇮🇹", clubs: ["Inter Mailand", "AC Mailand", "Juventus Turin", "SSC Neapel", "AS Rom", "Lazio Rom", "Atalanta Bergamo", "AC Florenz", "FC Bologna", "Como 1907", "FC Turin", "Udinese", "CFC Genua", "Cagliari", "US Lecce", "Hellas Verona", "Parma", "Sassuolo", "Cremonese", "Sampdoria"] },
  { name: "Bundesliga", code: "DE", flag: "🇩🇪", clubs: ["Bayern München", "Borussia Dortmund", "Bayer Leverkusen", "RB Leipzig", "Eintracht Frankfurt", "VfB Stuttgart", "SC Freiburg", "VfL Wolfsburg", "Borussia M’gladbach", "Werder Bremen", "Union Berlin", "TSG Hoffenheim", "Mainz 05", "FC Augsburg", "1. FC Köln", "Hamburger SV", "FC St. Pauli", "1. FC Heidenheim"] },
  { name: "Ligue 1", code: "FR", flag: "🇫🇷", clubs: ["Paris Saint-Germain", "Olympique Marseille", "AS Monaco", "OSC Lille", "Olympique Lyon", "OGC Nizza", "RC Lens", "Stade Rennes", "RC Straßburg", "FC Nantes", "Stade Brest", "FC Toulouse", "Stade Reims", "AS Saint-Étienne", "HSC Montpellier", "AJ Auxerre", "Le Havre AC", "FC Lorient"] },
  { name: "Liga Portugal", code: "PT", flag: "🇵🇹", clubs: ["Benfica Lissabon", "FC Porto", "Sporting Lissabon", "SC Braga", "Vitória Guimarães", "Boavista Porto", "FC Famalicão"] },
  { name: "Eredivisie", code: "NL", flag: "🇳🇱", clubs: ["Ajax Amsterdam", "PSV Eindhoven", "Feyenoord", "AZ Alkmaar", "FC Twente", "FC Utrecht", "Sparta Rotterdam"] },
  { name: "Süper Lig", code: "TR", flag: "🇹🇷", clubs: ["Galatasaray", "Fenerbahçe", "Beşiktaş", "Trabzonspor", "Başakşehir", "Samsunspor"] },
  { name: "Österreich", code: "AT", flag: "🇦🇹", clubs: ["RB Salzburg", "Rapid Wien", "Austria Wien", "Sturm Graz", "LASK", "Wolfsberger AC"] },
  { name: "Saudi Pro League", code: "SA", flag: "🇸🇦", clubs: ["Al-Hilal", "Al-Nassr", "Al-Ittihad", "Al-Ahli", "Al-Qadsiah", "Al-Ettifaq"] },
];

/** Alle 128 Vereine mit Index (der Index wird in Button-IDs benutzt). */
export const CLUBS = LEAGUES.flatMap((l, li) => l.clubs.map((name) => ({ name, league: l.name, li, code: l.code, flag: l.flag })));
const BY_NAME = Object.fromEntries(CLUBS.map((c, i) => [c.name, { ...c, idx: i }]));
export const club = (name) => BY_NAME[name];
export const clubIndex = (name) => BY_NAME[name]?.idx;
export const isFreilos = (name) => String(name).startsWith("Freilos");
export const flagOf = (name) => (isFreilos(name) ? "🎟️" : BY_NAME[name]?.flag ?? "⚽");
/** Kurzname für Spitznamen: "FC Barcelona" → "Barcelona" */
export function shortClub(name) {
  return String(name).replace(/^(1\. FC|FC|AC|AS|SC|RC|RCD|OGC|OSC|SSC|CFC|US|UD|AJ|HSC|TSG|VfB|VfL|AFC)\s+/, "");
}

/** Formate: Gruppengrößen, wie viele pro Gruppe sicher weiter (top) und wie viele „Beste des nächsten Platzes“ (ex). */
export const FORMATS = {
  8: { g: [4, 4], top: 2, ex: 0 },
  10: { g: [5, 5], top: 2, ex: 0 },
  12: { g: [4, 4, 4], top: 2, ex: 2 },
  14: { g: [5, 5, 4], top: 2, ex: 2 },
  16: { g: [4, 4, 4, 4], top: 2, ex: 0 },
  18: { g: [5, 5, 4, 4], top: 2, ex: 0 },
  20: { g: [5, 5, 5, 5], top: 2, ex: 0 },
  22: { g: [5, 5, 4, 4, 4], top: 1, ex: 3 },
  24: { g: [4, 4, 4, 4, 4, 4], top: 2, ex: 4 },
  26: { g: [5, 5, 4, 4, 4, 4], top: 2, ex: 4 },
  28: { g: [4, 4, 4, 4, 4, 4, 4], top: 2, ex: 2 },
  30: { g: [5, 5, 5, 5, 5, 5], top: 2, ex: 4 },
  32: { g: [4, 4, 4, 4, 4, 4, 4, 4], top: 2, ex: 0 },
};
export const FORMAT_KEYS = Object.keys(FORMATS).map(Number);
export const KO_SIZE = { 8: 4, 10: 4, 12: 8, 14: 8, 16: 8, 18: 8, 20: 8, 22: 8, 24: 16, 26: 16, 28: 16, 30: 16, 32: 16 };
export const KO_NAME = { 2: "Finale", 4: "Halbfinale", 8: "Viertelfinale", 16: "Achtelfinale" };

export const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const ROUND_ROLES = ["Achtelfinale", "Viertelfinale", "Halbfinale", "Finale", "Spiel um Platz 3"];
export const BASE_ROLES = ["Turnierleitung", "Manager", "Spieler"];

/** Kanal-Typen für /cl-einrichten kanal */
/** Kanal-Typen für /cl-einrichten kanal (max. 25 Auswahlmöglichkeiten → Gruppen separat) */
export const BASE_CHANNEL_TYPES = {
  welcome: "Willkommen",
  roles: "Rollenauswahl",
  notify: "Benachrichtigungen",
  rules: "Regelwerk",
  trophy: "Trophäenhalle",
  reg: "Team-registrieren",
  team: "Meine-Mannschaft",
  over: "Mannschaftsübersicht",
  live: "Live-Spielplan",
  hof: "Hall-of-Fame",
  tott: "TOTT (Team of the Tournament)",
  shop: "Shop (Vereinskasse)",
  feedback: "Feedback",
  ko: "KO-Phase",
  kor: "KO-Phase · Ergebnisse",
  ban: "Sperrliste",
  log: "Turnierleitung (Log)",
  support: "Support (Ticket-Panel)",
  bewerbung: "Staff-Bewerbung",
  admin: "Admin (Bewerbungen & Ticket-Log)",
};
export const CHANNEL_TYPES = {
  reg: "Team-registrieren",
  team: "Meine-Mannschaft",
  over: "Mannschaftsübersicht",
  live: "Live-Spielplan",
  hof: "Hall-of-Fame",
  tott: "TOTT (Team of the Tournament)",
  shop: "Shop (Vereinskasse)",
  feedback: "Feedback",
  rules: "Regelwerk",
  welcome: "Willkommen",
  roles: "Rollenauswahl",
  notify: "Benachrichtigungen",
  trophy: "Trophäenhalle",
  ko: "KO-Phase",
  kor: "KO-Phase · Ergebnisse",
  log: "Turnierleitung (Log)",
  ban: "Sperrliste",
  support: "Support (Ticket-Panel)",
  bewerbung: "Staff-Bewerbung",
  admin: "Admin (Bewerbungen & Ticket-Log)",
  ...Object.fromEntries(GROUP_NAMES.map((g) => ["g" + g, "Gruppe " + g])),
  ...Object.fromEntries(GROUP_NAMES.map((g) => ["r" + g, "Gruppe " + g + " · Ergebnisse"])),
};

export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const INACTIVE_DAYS = 7;

export const BAN_REASONS = [
  "Eingecheckt, aber nicht erschienen",
  "Während laufendem Turnierbetrieb rausgegangen",
  "Gruppen- oder K.-o.-Phase ohne Abmeldung verlassen",
  "Beleidigungen, Respektlosigkeit oder unsportliches Verhalten",
  "Sonstiger schwerer Regelverstoß",
];
export const BAN_DAYS = [1, 3, 7, 14, 30];
export const BAN_DEFAULT_DAYS = 7;

export const VIDEO_LIMIT = 3; // Größenvideo-Anforderungen pro Mannschaft und Turnier
export const VIDEO_WINDOW_MIN = 40; // nur bis zur 40. Spielminute (Spieluhr in FC 27)

export const RULES_VERSION = 1; // erhöhen, wenn sich das Regelwerk ändert → alle müssen neu akzeptieren
export const RULES = {
  title: "🏆 CHAMPIONS LEAGUE CUP – FC 27 REGELWERK",
  // Wird als eigener roter Kasten unter dem Regelwerk angezeigt
  highlight: {
    title: "🔴 7-TAGE-AKTIVITÄTSREGEL 🔴",
    text: "**Spielt eure Mannschaft 7 Tage lang keinen Cup, verliert ihr euren Verein!**\nEr wird dann automatisch wieder frei und kann von jemand anderem übernommen werden.\n\n⚠️ **Warnung** an Tag 5 und Tag 6 im Benachrichtigungs-Kanal\n✅ **Ein einziger Cup reicht**, damit der Zähler wieder bei null startet",
  },
  sections: [
    ["⚠️ Pflicht", "**5+1 ist Pflicht** – sonst seid ihr automatisch disqualifiziert."],
    ["🤝 Respekt & Fair Play", "Der Champions League Cup steht für Fairness und gegenseitigen Respekt.\nJeder Teilnehmer verpflichtet sich zu:\n• Respektvollem Umgang mit allen Spielern\n• Fair Play – auf und neben dem Platz\n• Sachlichen Diskussionen ohne Beleidigungen oder Provokationen\n• Sportlichem Verhalten – egal ob Sieg oder Niederlage"],
    ["❌ Nicht erlaubt", "• Beleidigungen oder toxisches Verhalten\n• Diskriminierung oder persönliche Angriffe\n• Absichtliches Ausnutzen von Bugs, Glitches oder unfairen Spielmechaniken\n\n**Wichtig:** Verstöße können – je nach Schwere – mit einer Verwarnung, einer Sperre oder dem Ausschluss aus dem Turnier geahndet werden."],
    ["📏 Größenregeln · Dreierkette (3er-Abwehr)", "• Alle 3 Innenverteidiger (IV): **bis 1,87 m**\n• Alle übrigen Feldspieler: **bis 1,82 m**\n• Torwart: **keine Größenbegrenzung**\n• 📏 Mit **Großer IV** aus dem Shop: 1 IV **bis 1,90 m** (gilt für einen Cup)"],
    ["📏 Größenregeln · Viererkette (4er-Abwehr)", "• Beide Innenverteidiger (IV): **bis 1,87 m**\n• 1 ZDM: **bis 1,87 m**\n• Alle übrigen Feldspieler: **bis 1,82 m**\n• Torwart: **keine Größenbegrenzung**\n• 📏 Mit **Großer IV** aus dem Shop: 1 IV **bis 1,90 m** (gilt für einen Cup)"],
    ["🎥 Größenvideos", "• Größenvideos können **nur in den ersten 40 Spielminuten** angefordert werden (Spieluhr im Spiel)\n• Jede Mannschaft darf **maximal 3×** pro Turnier ein Größenvideo anfordern\n• Der Gegner hat bis nach Ende des Spiels Zeit, das Video im Ergebniskanal zu posten"],
    ["⚖️ Fairness geht vor", "Unser Ziel ist ein wettbewerbsfähiges und faires Turnier, bei dem Können wichtiger ist als das Ausnutzen von Vorteilen.\nMit der Teilnahme am Champions League Cup akzeptiert jeder Spieler dieses Regelwerk und verpflichtet sich, es einzuhalten.\n\n**Champions League Cup – Respekt. Fairness. Wettbewerb.** ⭐"],
  ],
};

export const FREIGABE_MIN = 5; // maximale Freigabezeit: so viele Minuten nach der Freigabe muss angepfiffen sein
