// Alle Discord-Ansichten (Embeds, Buttons, Formulare). Alle Ränder in Blau.
import { coIds, isCo, MAX_CO } from "./co.mjs";
import { COLOR, LEAGUES, CLUBS, FORMATS, KO_SIZE, KO_NAME, BAN_REASONS, BAN_DAYS, BAN_DEFAULT_DAYS, VIDEO_LIMIT, VIDEO_WINDOW_MIN, RULES, FREIGABE_MIN, isFreilos, flagOf, club as clubInfo, clubIndex } from "./data.mjs";
import { fmtOf, nextFmt, standings, currentMatches, winner, koRoundName } from "./tournament.mjs";

const FOOTER = { text: "Champions League Bot" };

// ---------- Neues Discord-Layout („Components V2“): alles in einem Kasten ----------
const V2 = 1 << 15;
const box = (...children) => ({ type: 17, accent_color: COLOR, components: children.flat().filter(Boolean) });
const txt = (content) => ({ type: 10, content });
const line = (divider = true) => ({ type: 14, divider, spacing: 1 });
const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });
const section = (texts, thumb) => ({ type: 9, components: texts.map(txt), accessory: { type: 11, media: { url: thumb } } });
export const esc = (s) => String(s).replace(/([*_`~|\\>])/g, "\\$1");
const unix = (ms) => Math.floor(ms / 1000);
const hhmm = (ms) => `<t:${unix(ms)}:t>`;
const site = () => process.env.SITE_URL || process.env.URL || "";
const btn = (label, custom_id, style = 2, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });
const row = (...components) => ({ type: 1, components });
const ping = (ids) => ids.map((id) => `<@${id}>`).join(" ");
export const teamLine = (c) => `${flagOf(c)} **${esc(c)}**`;
/** Hinweis in Freigaben: Team hat im Shop den „Großen IV“ eingelöst */
export const bigIVNote = (t, clubs) => {
  const iv = clubs.filter((x) => t.bigIV?.includes(x)), bo = clubs.filter((x) => t.boost?.includes(x));
  return (iv.length ? `\n-# 📏 Großer IV: ${iv.map((x) => esc(x)).join(" und ")} ${iv.length === 1 ? "darf" : "dürfen"} je 1 IV bis **1,90 m** einsetzen` : "")
    + (bo.length ? `\n-# 🟣 Große Verstärkung: ${bo.map((x) => esc(x)).join(" und ")} ${bo.length === 1 ? "darf" : "dürfen"} mit dem ganzen Team **lila Verstärkung** benutzen` : "");
};
const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

// ---------- Team registrieren ----------
export function regPanel(clubs) {
  const taken = Object.keys(clubs).length;
  const lines = LEAGUES.map((l) => `${l.flag} **${l.name}** · ${l.clubs.filter((c) => !clubs[c]).length} frei`);
  return {
    flags: V2,
    components: [box(
      gallery(`${site()}/banner-registrieren.jpg`),
      txt(`## Mannschaft registrieren\nWähle eine Liga und deine Mannschaft. Jede Mannschaft gibt es nur einmal – wer zuerst kommt, wird Manager.\n👕 **${taken}/${CLUBS.length} vergeben** · ${CLUBS.length - taken} frei`),
      line(),
      txt("### 🌍 Ligen\n" + lines.join("\n")),
      line(),
      row(btn("Mannschaft registrieren", "reg_start", 1, { emoji: { name: "👕" } })),
      txt("-# Champions League Bot · Pro Manager eine Mannschaft"),
    )],
  };
}

export function regLeagues(clubs) {
  const buttons = LEAGUES.map((l, i) => btn(l.name, `reg_league:${i}`, 1, { emoji: { name: l.flag }, disabled: !l.clubs.some((c) => !clubs[c]) }));
  return { content: "**Schritt 1 · Liga wählen**", embeds: [], components: [row(...buttons.slice(0, 5)), row(...buttons.slice(5, 10))] };
}

export function regClubs(clubs, li) {
  const l = LEAGUES[li];
  const buttons = l.clubs.map((c) => btn(c.slice(0, 80), `reg_club:${clubIndex(c)}`, 2, { emoji: { name: l.flag }, disabled: !!clubs[c] }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(row(...buttons.slice(i, i + 5)));
  rows.push(row(btn("Zurück", "reg_start", 2, { emoji: { name: "↩️" } })));
  const free = l.clubs.filter((c) => !clubs[c]).length;
  return { content: `**${l.flag} Schritt 2 · ${l.name}** – ${free} von ${l.clubs.length} frei (ausgegraut = schon vergeben)`, embeds: [], components: rows.slice(0, 5) };
}

export function eaModal(customId, title, value = "") {
  return {
    type: 9,
    data: {
      custom_id: customId, title,
      components: [row({ type: 4, custom_id: "ea", label: "EA-FC-Clubname", style: 1, required: true, min_length: 3, max_length: 40, value: value || undefined, placeholder: "So wie er in EA FC Pro Clubs heißt" })],
    },
  };
}

export function newManagerPost(c, userId) {
  return { embeds: [{ color: COLOR, description: `${flagOf(c)} **Neuer Manager!**\n<@${userId}> übernimmt **${esc(c)}** (${clubInfo(c).league})` }] };
}
export function freeAgainPost(c, reason) {
  return { embeds: [{ color: COLOR, description: `${flagOf(c)} **Mannschaft wieder frei!**\n**${esc(c)}** (${clubInfo(c).league}) sucht einen neuen Manager.${reason ? `\n-# ${reason}` : ""}` }] };
}

// ---------- Meine Mannschaft ----------
export function teamPanel() {
  return {
    embeds: [{ color: COLOR, title: "🛡️ Meine Mannschaft", description: "Hier verwaltest du deine Mannschaft: Co-VM, EA-Club, verlassen oder löschen.\nDas Fenster kann nur der jeweilige Manager sehen.", footer: FOOTER }],
    components: [row(btn("Meine Mannschaft öffnen", "team_open", 1, { emoji: { name: "🛡️" } }))],
  };
}

export function teamDetail(c, data, role, todayDaysRaw) {
  const protectedNow = todayDaysRaw < 0 || data.protectUntil > Date.now();
  const todayDays = Math.max(0, todayDaysRaw);
  const left = Math.max(0, 7 - todayDays);
  const bar = "🟩".repeat(Math.min(7, todayDays)).replace(/🟩/g, todayDays >= 5 ? "🟨" : "🟩") + "⬛".repeat(left);
  return {
    content: "",
    embeds: [{
      color: COLOR,
      title: `${flagOf(c)} ${c.toUpperCase()}`,
      description: `${clubInfo(c).league}${role === "co" ? " · Du bist **Co-VM**" : ""}`,
      fields: [
        { name: "Manager", value: `<@${data.manager}>`, inline: true },
        { name: `Co-VMs (${coIds(data).length}/${MAX_CO})`, value: coIds(data).length ? coIds(data).map((u) => `<@${u}>`).join("\n") : "–", inline: true },
        { name: "EA-Club", value: `${esc(data.ea || "–")}\n${data.eaId ? "-# ✅ mit EA verknüpft" : data.eaLookup?.ok === false && !data.eaLookup?.err ? "-# ⚠️ bei EA nicht gefunden – Namen prüfen" : "-# ⏳ noch nicht verknüpft"}`, inline: true },
        { name: "Aktivität", value: protectedNow ? `🛡️ **Urlaubsschutz** bis <t:${Math.floor(data.protectUntil / 1000)}:f> – die 7-Tage-Regel pausiert.` : `${todayDays === 0 ? "**Aktiv** · heute gespielt" : `${todayDays >= 5 ? "**Achtung**" : "**Aktiv**"} · zuletzt gespielt vor ${todayDays} ${todayDays === 1 ? "Tag" : "Tagen"}`}\n${bar}\nNoch ${left} ${left === 1 ? "Tag" : "Tage"} bis zum Reset`, inline: false },
        { name: "Cups", value: String(data.cups ?? 0), inline: true },
        { name: "Titel", value: String(data.titles ?? 0), inline: true },
        { name: "💰 Vereinskasse", value: `**${data.coins || 0}** 🪙${data.bigIV ? ` · 📏 ${data.bigIV}× Großer IV` : ""}${data.boost ? ` · 🟣 ${data.boost}× Verstärkung` : ""}${data.tickets ? ` · 🎫 ${data.tickets}× Ticket` : ""}`, inline: true },
      ],
    }],
    components: role === "manager"
      ? [
          row(btn("Co-VM hinzufügen", "team_co_add", 1, { disabled: coIds(data).length >= MAX_CO }), btn("EA-Club ändern", "team_ea", 1)),
          row(btn("Co-VM entfernen", "team_co_rem", 2, { disabled: !coIds(data).length }), btn("Mannschaft verlassen", "team_leave", 4), btn("Mannschaft löschen", "team_del", 4)),
        ]
      : [row(btn("EA-Club ändern", "team_ea", 1), btn("Als Co-VM austreten", "team_co_quit", 4))],
  };
}

export function coSelect() {
  return {
    content: `**Wähle einen Co-VM** (bis zu ${MAX_CO} pro Mannschaft). Er kann die Mannschaft anmelden, einchecken und Ergebnisse melden. Er bekommt die Rolle Manager, die Rolle Spieler wird entfernt.`,
    embeds: [],
    components: [row({ type: 5, custom_id: "team_co_pick", placeholder: "Mitglied auswählen", min_values: 1, max_values: 1 }), row(btn("Zurück", "team_open"))],
  };
}

export function coRemoveSelect(cos) {
  return {
    content: "**Welchen Co-VM willst du entfernen?** Er bekommt die Rolle Spieler zurück.",
    embeds: [],
    components: [
      row({ type: 3, custom_id: "team_co_rem_pick", placeholder: "Co-VM auswählen", min_values: 1, max_values: 1, options: cos.map((x) => ({ label: (x.base || x.id).slice(0, 100), value: x.id })) }),
      row(btn("Zurück", "team_open")),
    ],
  };
}

export function confirmView(text, okId, okLabel) {
  return { content: `⚠️ ${text}`, embeds: [], components: [row(btn("Abbrechen", "team_open"), btn(okLabel, okId, 4))] };
}

// ---------- Mannschaftsübersicht ----------
export function overviewMessages(clubs) {
  const taken = Object.keys(clubs).length;
  const leagueEmbed = (l) => {
    const lines = l.clubs.filter((c) => clubs[c]).map((c) => `**${esc(c)}** · <@${clubs[c].manager}>${coIds(clubs[c]).map((u) => ` + <@${u}>`).join("")}`);
    return lines.length ? { color: COLOR, title: `${l.flag} ${l.name} · ${lines.length}/${l.clubs.length}`, description: lines.join("\n") } : null;
  };
  const groups = [[0, 1], [2, 3, 4], [5, 6, 7, 8, 9]];
  const head = { color: COLOR, title: "⭐ MANNSCHAFTSÜBERSICHT", description: `**Übernommen:** ${taken}/${CLUBS.length} · **Frei:** ${CLUBS.length - taken}\n${"▰".repeat(Math.round((taken / CLUBS.length) * 16))}${"▱".repeat(16 - Math.round((taken / CLUBS.length) * 16))}`, footer: { text: "Aktualisiert sich automatisch" } };
  return groups.map((ids, k) => {
    const embeds = ids.map((i) => leagueEmbed(LEAGUES[i])).filter(Boolean);
    if (k === 0) embeds.unshift(head);
    if (!embeds.length) embeds.push({ color: COLOR, description: "-# Noch keine Mannschaften in diesen Ligen." });
    return { embeds };
  });
}

// ---------- Anmeldeliste ----------
const SQ = { g: "🟩", y: "🟨", x: "⬛" };
function formatBlock(n, closed) {
  const f = fmtOf(n), next = nextFmt(n);
  const prog = (from, to) => {
    if (!to) return "Maximales Format erreicht – weitere Mannschaften kommen auf die Warteliste.";
    const fill = Math.round(((n - from) / (to - from)) * 10);
    return `${"▰".repeat(fill)}${"▱".repeat(10 - fill)} noch **${to - n} ${to - n === 1 ? "Mannschaft" : "Mannschaften"}** bis zum **${to}er**`;
  };
  if (!f) return `**⚠️ Noch kein Format**\nMindestens **8 Mannschaften** nötig, damit der Cup stattfindet.\n${prog(0, 8)}`;
  const d = FORMATS[f], mixed = new Set(d.g).size > 1;
  const grid = d.g.map((s, k) => `\`${"ABCDEFGH"[k]}\` ${Array.from({ length: s }, (_, p) => (p < d.top ? SQ.g : p === d.top && d.ex ? SQ.y : SQ.x)).join("")}`);
  const rows = [];
  for (let i = 0; i < grid.length; i += 2) rows.push(grid.slice(i, i + 2).join("   "));
  const rule = d.top === 1 ? `${SQ.g} **Gruppensieger** ${SQ.y} **${d.ex} beste Zweite**` : `${SQ.g} **Platz 1 + 2**${d.ex ? ` ${SQ.y} **${d.ex} beste Dritte**` : ""}`;
  return `**🏟️ Format: ${f}er**\n**Gruppen:** ${mixed ? d.g.join(" · ") : `${d.g.length} × ${d.g[0]}`}  ·  **Weiter:** ${KO_SIZE[f]} von ${f}  ·  **K.-o. ab:** ${KO_NAME[KO_SIZE[f]]}\n${rows.join("\n")}\n${rule} ${SQ.x} **raus**${mixed && d.ex ? "\n-# Bei unterschiedlich großen Gruppen zählt der Punkteschnitt pro Spiel." : ""}${closed ? "" : "\n" + prog(f, next)}`;
}

const STATUS = {
  anmeldung: "🟢 **Anmeldung offen**",
  checkin: "🟡 **Check-in läuft** in den Gruppenkanälen",
  gruppen: "⚽ **Gruppenphase läuft**",
  ko: "🔥 **K.-o.-Phase läuft**",
  fertig: "🏆 **Turnier beendet**",
  abgesagt: "⚠️ **Cup abgesagt** – zu wenige Mannschaften",
  geloescht: "🗑️ **Turnier abgebrochen**",
};

export function signupPanel(t, clubs = {}) {
  const n = t.reg.length, f = fmtOf(n);
  const closed = t.status !== "anmeldung";
  const real = t.reg.filter((c) => !isFreilos(c)), free = t.reg.filter(isFreilos);
  const ordered = [...real.slice(0, f || n), ...free, ...real.slice(f || n)];
  const playing = closed ? (t.playing.length ? t.playing : t.reg) : f ? ordered.slice(0, f) : ordered;
  const wait = closed ? t.wait : f ? ordered.slice(f).filter((c) => !isFreilos(c)) : [];
  const num = (k) => `\`${String(k + 1).padStart(2, "0")}\``;
  const who = (c) => (clubs[c]?.manager ? ` | <@${clubs[c].manager}>` : "");
  const tl = (c, k, waitList) => isFreilos(c)
    ? `${num(k)} 🎟️ **Freilos**`
    : `${num(k)} ${flagOf(c)} **${esc(c)}**${who(c)}${t.status === "checkin" && waitList ? (t.waitChecked.includes(c) ? " ✅" : " ⏳") : ""}`;
  const freeCount = playing.filter(isFreilos).length;
  const target = f || 8;
  const times = t.times;
  const head = [
    `## ${esc(t.name)}`,
    ...(t.ticketOnly ? ["🎫 **Sonderturnier** – Teilnahme nur mit **Sonderturnier-Ticket** aus dem Shop. Das Ticket wird beim Check-in eingelöst."] : []),
    `${STATUS[t.status]}\n⏰ **Anpfiff** <t:${unix(times.kickoff)}:F> · <t:${unix(times.kickoff)}:R>\n👥 **${playing.length}/${closed ? playing.length : target} Mannschaften** · 20 Min pro Runde`,
  ];
  const teamsText =
    `### 👥 Mannschaften (${playing.length}${f && !closed ? "/" + f : ""})${freeCount ? ` · davon ${freeCount} Freilos` : ""}\n` +
    (playing.length ? playing.map((c, k) => tl(c, k)).join("\n") : "_Noch keine Anmeldungen_") +
    (wait.length ? `\n\n**⏳ Warteliste**\n${wait.map((c, k) => tl(c, k, true)).join("\n")}\n-# Rückt nach, wenn eine Mannschaft nicht eincheckt.` : "") +
    (freeCount ? "\n-# 🎟️ Wer gegen ein Freilos spielt, gewinnt automatisch 3:0. Freilose kommen nie weiter." : "");
  const buttons = [];
  if (t.status === "anmeldung") buttons.push(row(btn("Anmelden", "cup_join", 1, { emoji: { name: "⭐" } }), btn("Abmelden", "cup_leave")));
  if (t.status === "checkin" && t.wait.length) buttons.push(row(btn("Warteliste: Einchecken", "cup_waitci", 3, { emoji: { name: "✅" } })));
  return {
    flags: V2,
    components: [box(
      gallery(`${site()}/banner-anmeldung.jpg`),
      txt(head.join("\n")),
      line(),
      txt(formatBlock(closed ? t.playing.length || n : n, closed).replace(/^\*\*🏟️ Format: (\d+)er\*\*/, "### 🏟️ Turnierplan: $1er-Format").replace(/^\*\*⚠️ Noch kein Format\*\*/, "### ⚠️ Noch kein Format")),
      line(),
      txt(`### ⏰ Ablauf\n${hhmm(times.close)} Anmeldeschluss · ${hhmm(times.close)} Auslosung · ${hhmm(times.checkinEnd)} Check-in-Ende · ${hhmm(times.kickoff)} Anpfiff`),
      line(),
      txt(teamsText.slice(0, 3000)),
      ...(buttons.length ? [line(false), ...buttons] : []),
      txt("-# Champions League Bot"),
    )],
  };
}

export function drawPost(t) {
  const d = FORMATS[t.fmt];
  const rule = d.top === 1 ? `alle Gruppensieger + ${d.ex} beste Zweite` : `Erste und Zweite${d.ex ? ` + ${d.ex} beste Dritte` : ""}`;
  return {
    content: `🔒 **Anmeldung geschlossen – ${t.fmt}er-Format.** Check-in läuft jetzt bis ${hhmm(t.times.checkinEnd)} in eurem Gruppenkanal.${t.wait.length ? ` ${t.wait.length} ${t.wait.length === 1 ? "Mannschaft steht" : "Mannschaften stehen"} auf der Warteliste und checkt oben im Anmelde-Post ein.` : ""}`,
    embeds: [{ color: COLOR, title: `⭐ Auslosung · ${t.fmt}er-Format`, fields: t.groups.map((g) => ({ name: `Gruppe ${g.name}`, value: g.teams.map((c) => `${flagOf(c)} ${esc(c)}`).join("\n"), inline: true })), description: `**Weiter ins ${KO_NAME[KO_SIZE[t.fmt]]}:** ${rule}` }],
  };
}

// ---------- Gruppenkanal ----------
export function groupCheckin(t, g, roleId) {
  const lines = g.teams.map((c) => `${t.checked.includes(c) ? "✅" : t.out.includes(c) ? "❌" : "⏳"} ${flagOf(c)} ${esc(c)}`);
  const open = t.status === "checkin";
  return {
    content: open && roleId ? `<@&${roleId}>` : "",
    allowed_mentions: { roles: open && roleId ? [roleId] : [] },
    embeds: [{
      color: COLOR, title: `⭐ Gruppe ${g.name} · Check-in`,
      description: (open ? `Bitte bis ${hhmm(t.times.checkinEnd)} einchecken. Wer nicht eincheckt, wird durch die Warteliste ersetzt.\n\n` : "") + lines.join("\n") + `\n\n-# Eingecheckt: ${g.teams.filter((c) => t.checked.includes(c)).length}/${g.teams.length}`,
    }],
    components: open ? [row(btn("Einchecken", "grp_ci", 3, { emoji: { name: "✅" } }))] : [],
  };
}

export function tableText(t, gName) {
  const rows = standings(t, gName);
  return "```\n#  Verein            Sp S-U-N  TD Pkt\n" + rows.map((r, i) => `${i + 1}  ${pad(r.id + (t.out.includes(r.id) ? " ✗" : ""), 17)} ${String(r.sp).padStart(2)} ${`${r.s}-${r.u}-${r.n}`.padStart(5)} ${((r.t - r.gt) > 0 ? "+" + (r.t - r.gt) : String(r.t - r.gt)).padStart(3)} ${String(r.p).padStart(3)}`).join("\n") + "\n```";
}

export function matchLine(m, showId = true) {
  const st = m.ff ? "gewertet" : m.status === "fertig" ? "" : m.status === "konflikt" ? "⚠️" : "";
  const id = showId ? `\`#${m.id}\` ` : "";
  if (m.status !== "fertig") return `${id}${flagOf(m.home)} ${esc(m.home)} – ${esc(m.away)} ${flagOf(m.away)} ${st}`.trim();
  const w = m.phase === "ko" ? winner(m) : m.h > m.a ? m.home : m.a > m.h ? m.away : null;
  const nm = (c) => (c === w ? `**${esc(c)}**` : esc(c));
  return `${id}${flagOf(m.home)} ${nm(m.home)} **${m.h}:${m.a}**${m.pen ? ` (${m.pen[0]}:${m.pen[1]} i.E.)` : ""} ${nm(m.away)} ${flagOf(m.away)}${m.ff ? " · gewertet" : ""}`;
}

export function groupPlan(t, g, resultChannel) {
  const ms = t.matches.filter((m) => m.phase === "gruppe" && m.group === g.name);
  const rounds = [...new Set(ms.map((m) => m.round))];
  // Kurz und knapp: nur Gegner und Ergebnisse
  const line = (m) => {
    if (m.status !== "fertig") return `${flagOf(m.home)} ${esc(m.home)} – ${esc(m.away)} ${flagOf(m.away)}`;
    const w = m.h > m.a ? m.home : m.a > m.h ? m.away : null;
    const nm = (c) => (c === w ? `**${esc(c)}**` : esc(c));
    return `${flagOf(m.home)} ${nm(m.home)} **${m.h}:${m.a}** ${nm(m.away)} ${flagOf(m.away)}`;
  };
  const desc = rounds.map((r) => `**Spieltag ${r}**\n` + ms.filter((m) => m.round === r).map(line).join("\n")).join("\n\n");
  const fallback = t.status === "gruppen" && !resultChannel; // ohne Ergebniskanal bleiben die Buttons hier
  return {
    embeds: [{ color: COLOR, title: `📋 Gruppe ${g.name} · Spielplan`, description: desc.slice(0, 4096) }],
    components: fallback ? [row(btn("Ergebnis melden", "res_open", 1, { emoji: { name: "⚽" } }), btn("Größenvideo anfordern", "vid_req", 2, { emoji: { name: "📏" } }))] : [],
  };
}

// ---------- Ergebnis melden ----------
export function resultModal(m, koLabel) {
  const input = (id, label, required, max, placeholder) => row({ type: 4, custom_id: id, label: label.slice(0, 45), style: 1, required, max_length: max, placeholder });
  const comps = [input("h", `Tore ${m.home}`, true, 2, "0"), input("a", `Tore ${m.away}`, true, 2, "0")];
  if (m.phase === "ko") comps.push(input("pen", "Elfmeter, nur bei Unentschieden (z. B. 4:3)", false, 5, "leer lassen, wenn kein Remis"));
  return { type: 9, data: { custom_id: `res:${m.id}`, title: (m.phase === "gruppe" ? `Ergebnis · Spiel #${m.id}` : `${koLabel} · Spiel #${m.id}`).slice(0, 45), components: comps } };
}

export function matchPicker(ms) {
  return {
    content: "Für welches Spiel willst du das Ergebnis melden?",
    components: [row({ type: 3, custom_id: "res_pick", placeholder: "Spiel auswählen", options: ms.slice(0, 25).map((m) => ({ label: `#${m.id} ${m.home} vs ${m.away}`.slice(0, 100), value: String(m.id), description: m.phase === "gruppe" ? `Gruppe ${m.group} · Spieltag ${m.round}` : "K.-o.-Runde" })) })],
  };
}

export function resultConfirmed(m, byAdmin) {
  return { embeds: [{ color: COLOR, description: `${byAdmin ? "✏️ **Ergebnis durch die Turnierleitung**" : "✅ **Ergebnis bestätigt**"}\n${matchLine(m, false)}` }] };
}

// ---------- Live-Spielplan ----------
export function livePlan(t) {
  // Fortschritt: ✅ Spieltag 1 › 🔴 Spieltag 2 › Spieltag 3 › Halbfinale › Finale
  const steps = [];
  for (let r = 1; r <= t.maxRounds; r++) steps.push({ k: "g", r, n: `Spieltag ${r}` });
  let n = t.koSize || KO_SIZE[t.fmt], kr = 1;
  while (n > 2) { steps.push({ k: "k", r: kr, n: KO_NAME[n] }); n /= 2; kr++; }
  steps.push({ k: "k", r: kr, n: "Finale" });
  const on = (s) => (t.status === "gruppen" && s.k === "g" && s.r === t.round) || (t.status === "ko" && s.k === "k" && s.r === t.koRound);
  const done = (s) => t.status === "fertig" || (s.k === "g" && (t.status === "ko" || (t.status === "gruppen" && s.r < t.round))) || (s.k === "k" && t.status === "ko" && s.r < t.koRound);
  const prog = steps.map((s) => (on(s) ? `🔴 **${s.n}**` : done(s) ? `✅ ${s.n}` : s.n)).join(" › ");
  const cur = currentMatches(t);
  const status =
    t.status === "checkin" ? `🕗 **Check-in läuft** · ${t.fmt}er-Format · Anpfiff ${hhmm(t.times.kickoff)}`
    : t.status === "fertig" ? `🏆 **Turnier beendet** · ${t.fmt}er-Format`
    : `🔴 **${t.status === "gruppen" ? `Spieltag ${t.round}` : koRoundName(t) + (cur.some((m) => m.p3) ? " + Spiel um Platz 3" : "")} läuft** · ${cur.filter((m) => m.status === "fertig").length}/${cur.length} Spiele beendet · ${t.fmt}er-Format`;

  // Ein Spiel als Zeile mit Status
  const icon = (m) => (m.status === "fertig" ? "✅" : m.status === "konflikt" ? "⚠️" : m.pendingBy ? "⏳" : t.status === "checkin" ? "🕗" : "🔴");
  const sc = (m) => (m.status === "fertig" ? `\`${m.h}:${m.a}\`${m.pen ? ` (${m.pen[0]}:${m.pen[1]} i.E.)` : ""}` : "`–:–`");
  const mline = (m) => `${icon(m)} ${flagOf(m.home)} **${esc(m.home)}** ${sc(m)} **${esc(m.away)}** ${flagOf(m.away)}`;

  const d = FORMATS[t.fmt];
  const parts = [];
  if (t.status === "checkin" || t.status === "gruppen") {
    const r = t.status === "checkin" ? 1 : t.round;
    const budget = Math.floor(3300 / Math.max(1, t.groups.length));
    for (const g of t.groups) {
      const ms = t.matches.filter((m) => m.group === g.name && m.round === r);
      const tab = standings(t, g.name).map((x, k) => {
        const out = isFreilos(x.id) || t.out?.includes(x.id);
        const mark = out ? "⬛" : k < d.top ? "🟩" : k === d.top && d.ex ? "🟨" : "⬛";
        const td = x.t - x.gt;
        return `${mark} \`${k + 1}\` ${flagOf(x.id)} ${esc(x.id)} · **${x.p} Pkt** · TD ${td > 0 ? "+" + td : td}`;
      });
      parts.push(`### ⚽ Gruppe ${g.name} · Spieltag ${r}\n${ms.length ? ms.map(mline).join("\n") : "_spielfrei_"}\n\n${tab.join("\n")}`.slice(0, budget));
    }
  }
  if (t.status === "ko") {
    const lbl = (m) => (m.p3 ? "🥉 Platz 3" : m.final ? "🏆 Finale" : `Spiel ${m.slot + 1}`);
    parts.push(`### ⚔️ ${koRoundName(t)}${cur.some((m) => m.p3) ? " + Spiel um Platz 3" : ""}\n` + cur.sort((a, b) => a.slot - b.slot).map((m) => `\`${lbl(m)}\` ${mline(m)}`).join("\n"));
  }
  if (t.status === "fertig" && t.podium) parts.push("### 🏆 Endstand\n" + t.podium.map((c, i) => `${["🥇", "🥈", "🥉"][i]} ${teamLine(c)}`).join("\n"));
  const legend = t.status === "gruppen" || t.status === "checkin"
    ? `-# 🟩 weiter${d.ex ? ` · 🟨 ${d.top === 1 ? "beste Zweite" : "beste Dritte"}` : ""} · ⬛ raus · ✅ bestätigt · 🔴 läuft · ⏳ wartet auf Bestätigung · aktualisiert <t:${unix(Date.now())}:t>`
    : `-# ✅ bestätigt · 🔴 läuft · ⏳ wartet auf Bestätigung · aktualisiert <t:${unix(Date.now())}:t>`;
  return {
    flags: V2,
    components: [box(
      txt(`## 📺 Live-Spielplan · ${esc(t.name)}\n${status}\n-# ${prog}`),
      ...parts.flatMap((p) => [line(), txt(p)]),
      line(),
      txt(legend),
    )],
  };
}

// ---------- K.-o.-Phase ----------
export function koRoundPost(t, members, roleIds, resultChannel) {
  const cur = currentMatches(t).sort((a, b) => a.slot - b.slot);
  const pair = (m) => `${teamLine(m.home)} vs ${teamLine(m.away)}${bigIVNote(t, [m.home, m.away])}\n${ping([...(members[m.home] || []), ...(members[m.away] || [])])}`;
  const fin = cur.find((m) => m.final), p3 = cur.find((m) => m.p3);
  const name = koRoundName(t);
  const roles = fin ? [roleIds["Finale"], p3 ? roleIds["Spiel um Platz 3"] : null] : [roleIds[name]];
  const desc = fin ? `**🏆 Finale**\n${pair(fin)}${p3 ? `\n\n**🥉 Spiel um Platz 3**\n${pair(p3)}` : ""}` : cur.map(pair).join("\n\n");
  const userIds = cur.flatMap((m) => [...(members[m.home] || []), ...(members[m.away] || [])]);
  return {
    content: `${roles.filter(Boolean).map((r) => `<@&${r}>`).join(" ")} 🟢 **FREIGABE · ${fin ? "Finale & Spiel um Platz 3" : name}** – ihr dürft jetzt spielen!${fin ? " Beide Spiele laufen gleichzeitig." : ""}\n${freigabeWindow()}`,
    allowed_mentions: { roles: roles.filter(Boolean), users: userIds },
    embeds: [{ color: COLOR, title: fin ? "🏆 Finale & Spiel um Platz 3" : `⚔️ ${name}`, description: desc + (resultChannel ? `\n\n📋 Ergebnisse und Größenvideos: <#${resultChannel}>` : "") + "\n\n-# Unentschieden? Dann Elfmeterschießen mit angeben.", footer: FOOTER }],
    components: resultChannel ? [] : [row(btn("Ergebnis melden", "res_open", 1, { emoji: { name: "⚽" } }), btn("Größenvideo anfordern", "vid_req", 2, { emoji: { name: "📏" } }))],
  };
}

export function bracket(t) {
  const fields = [];
  for (let r = 1; r <= t.koRound; r++) {
    const ms = t.matches.filter((m) => m.phase === "ko" && m.round === r).sort((a, b) => a.slot - b.slot);
    const fin = ms.find((m) => m.final);
    if (fin) {
      fields.push({ name: "🏆 Finale", value: matchLine(fin, false) });
      const p3 = ms.find((m) => m.p3);
      if (p3) fields.push({ name: "🥉 Spiel um Platz 3", value: matchLine(p3, false) });
    } else fields.push({ name: koRoundName(t, r), value: ms.map((m) => matchLine(m, false)).join("\n").slice(0, 1024) });
  }
  return { embeds: [{ color: COLOR, title: `⭐ Turnierbaum · ${t.name}`, fields, footer: { text: "Aktualisiert sich automatisch" } }] };
}

// ---------- Hall of Fame ----------
export function hofText(t, members, titleNo, finalLine) {
  const [a, b, c] = t.podium;
  const who = (club) => (members[club] || []).map((id) => `<@${id}>`).join(" ");
  const lines = [
    `🥇 **${esc(a)}** ${flagOf(a)} – ${who(a)}\nChampions-League-Sieger! Finale: ${finalLine}.`,
    `🥈 **${esc(b)}** ${flagOf(b)} – ${who(b)}\nStarke Leistung bis ins Finale – Platz 2!`,
    c ? `🥉 **${esc(c)}** ${flagOf(c)} – ${who(c)}\nSpiel um Platz 3 gewonnen – Bronze!` : null,
  ].filter(Boolean);
  return {
    content: `🏆 **Glückwunsch an die Sieger der ${esc(t.name)}!**\n\n${lines.join("\n\n")}\n\n-# ${t.playing.length - t.out.length} Mannschaften · ${t.fmt}er-Format · Titel Nr. ${titleNo} für ${esc(a)}`,
    allowed_mentions: { users: t.podium.flatMap((x) => members[x] || []) },
  };
}

// ---------- Sperrliste ----------
export function banPanel(bans, clubs) {
  const clubOf = (u) => Object.entries(clubs).find(([, c]) => c.manager === u || isCo(c, u))?.[0];
  const lines = bans.map((b) => {
    const c = clubOf(b.user) || b.club;
    return `🚫 <@${b.user}>${c ? ` · ${flagOf(c)} **${esc(c)}**` : ""}\n${BAN_REASONS[b.reason]} · bis <t:${unix(b.until)}:f> (<t:${unix(b.until)}:R>)`;
  });
  return {
    embeds: [{
      color: COLOR,
      title: "🚫 CHAMPIONS LEAGUE CUP | SPERRLISTE",
      description:
        "Hier landen Mannschaften, die den Turnierabend kaputt machen, nicht auftauchen oder den Ablauf unnötig bremsen.\n\n" +
        "**Gründe**\n" + BAN_REASONS.map((r) => `• ${r}`).join("\n") +
        "\n\n**Dauer**\n• Standardsperre 7 Tage\n• Abgelaufene Sperren werden automatisch entfernt\n\n" +
        `**Aktuell gesperrt (${bans.length})**\n` + (lines.length ? lines.join("\n\n") : "_Aktuell ist niemand gesperrt._"),
      footer: { text: "Aktualisiert sich automatisch · Sperren: Turnierleitung & Mods" },
    }],
    components: [row(btn("Person sperren", "ban_start", 4, { emoji: { name: "🚫" } }), btn("Sperre aufheben", "ban_lift", 2, { disabled: !bans.length }))],
  };
}

export const banStep1 = () => ({ content: "**Schritt 1 · Wen sperren?** Wähle die Person (Manager oder Co-VM).", embeds: [], components: [row({ type: 5, custom_id: "ban_user", placeholder: "Mitglied auswählen", min_values: 1, max_values: 1 })] });

export const banStep2 = (u) => ({
  content: `**Schritt 2 · Grund** für <@${u}>`, embeds: [],
  components: [row({ type: 3, custom_id: `ban_r:${u}`, placeholder: "Grund auswählen", options: BAN_REASONS.map((r, i) => ({ label: r.slice(0, 100), value: String(i) })) })],
});

export const banStep3 = (u, r) => ({
  content: `**Schritt 3 · Dauer** für <@${u}> – ${BAN_REASONS[r]}`, embeds: [],
  components: [row({ type: 3, custom_id: `ban_d:${u}:${r}`, placeholder: "Dauer auswählen", options: BAN_DAYS.map((d) => ({ label: `${d} ${d === 1 ? "Tag" : "Tage"}${d === BAN_DEFAULT_DAYS ? " (Standard)" : ""}`, value: String(d), default: d === BAN_DEFAULT_DAYS })) })],
});

export const banStep4 = (u, r, d, partners = []) => ({
  content: `**Bestätigen:** <@${u}> für **${d} ${d === 1 ? "Tag" : "Tage"}** sperren – ${BAN_REASONS[r]}${partners.length ? `\n-# ${partners.map((p) => `<@${p}>`).join(", ")} ${partners.length > 1 ? "gehören" : "gehört"} zur selben Mannschaft und ${partners.length > 1 ? "können" : "kann"} mitgesperrt werden.` : ""}`,
  embeds: [],
  components: [row(
    btn("Sperren", `ban_ok:${u}:${r}:${d}:1`, 4),
    ...(partners.length ? [btn(partners.length > 1 ? "Ganze Mannschaft sperren" : "Beide sperren", `ban_ok:${u}:${r}:${d}:2`, 4)] : []),
    btn("Mit Notiz sperren", `ban_note:${u}:${r}:${d}:${partners.length ? 2 : 1}`, 2),
  )],
});

export const banNoteModal = (rest) => ({ type: 9, data: { custom_id: `ban_m:${rest}`, title: "Sperre mit Notiz", components: [row({ type: 4, custom_id: "note", label: "Notiz (nur für die Turnierleitung)", style: 2, required: true, max_length: 300 })] } });

export const banLiftPicker = (bans) => ({
  content: "**Welche Sperre aufheben?**", embeds: [],
  components: [row({ type: 3, custom_id: "ban_lift_pick", placeholder: "Gesperrte Person auswählen", options: bans.slice(0, 25).map((b) => ({ label: `${b.club || "ohne Mannschaft"} – bis ${new Date(b.until).toLocaleDateString("de-AT")}`.slice(0, 100), description: BAN_REASONS[b.reason].slice(0, 100), value: b.user })) })],
});

// ---------- Ergebniskanal pro Gruppe ----------
export function resultPanel(t, g) {
  const r = t.status === "gruppen" ? t.round : t.status === "checkin" ? 1 : null;
  const ms = r ? t.matches.filter((m) => m.group === g.name && m.round === r) : [];
  const open = t.status === "gruppen";
  return {
    embeds: [{
      color: COLOR,
      title: `📋 Gruppe ${g.name} · Ergebnisse & Größenvideos`,
      description:
        "Hier tragt ihr eure Ergebnisse ein und könnt vom Gegner ein **Größenvideo** anfordern.\n\n" +
        "• **Ergebnis eintragen:** eine Mannschaft trägt ein, der Gegner hat **2 Minuten** zum Bestätigen – sonst gilt das Ergebnis. Bei unterschiedlichen Ergebnissen wird die Turnierleitung markiert.\n" +
        `• **Größenvideo anfordern:** nur in den ersten ${VIDEO_WINDOW_MIN} Spielminuten, maximal ${VIDEO_LIMIT}× pro Mannschaft und Turnier, 1× pro Spiel. Der Gegner hat bis nach Ende des Spiels Zeit, das Video hier im Kanal zu posten.\n\n` +
        (t.status === "checkin" ? "_Los geht’s nach dem Check-in._" : r ? `**Spieltag ${r}**\n${ms.length ? ms.map((m) => matchLine(m)).join("\n") : "_spielfrei_"}` : "_Die Gruppenphase ist beendet._"),
      footer: { text: "Aktualisiert sich automatisch" },
    }],
    components: open ? [row(btn("Ergebnis eintragen", "res_open", 1, { emoji: { name: "⚽" } }), btn("Größenvideo anfordern", "vid_req", 2, { emoji: { name: "📏" } }))] : [],
  };
}

export function videoPost(v, users) {
  return {
    content: users.map((u) => `<@${u}>`).join(" "),
    allowed_mentions: { users },
    embeds: [{
      color: COLOR, title: "📏 Größenvideo angefordert",
      description: `${flagOf(v.by)} **${esc(v.by)}** fordert von ${flagOf(v.to)} **${esc(v.to)}** ein Größenvideo an (Spiel #${v.matchId}${v.minute ? `, ${v.minute}. Spielminute` : ""}).\n\n⏳ **Bis nach Ende des Spiels hast du Zeit, das Video in diesem Kanal zu posten.**`,
    }],
  };
}
export const videoModal = (id) => ({ type: 9, data: { custom_id: `vid_m:${id}`, title: "Größenvideo einreichen", components: [row({ type: 4, custom_id: "link", label: "Video-Link (YouTube, Streamable, Medal …)", style: 1, required: true, max_length: 300, placeholder: "https://" })] } });

export function koResultPanel(t) {
  const open = t.status === "ko";
  const cur = open ? currentMatches(t).sort((a, b) => a.slot - b.slot) : [];
  const lbl = (m) => (m.p3 ? "Platz 3" : m.final ? "Finale" : `Spiel ${m.slot + 1}`);
  const title = open ? koRoundName(t) + (cur.some((m) => m.p3) ? " + Spiel um Platz 3" : "") : null;
  return {
    embeds: [{
      color: COLOR,
      title: "📋 K.-o.-Phase · Ergebnisse & Größenvideos",
      description:
        "Hier tragt ihr eure K.-o.-Ergebnisse ein und könnt vom Gegner ein **Größenvideo** anfordern.\n\n" +
        "• **Ergebnis eintragen:** eine Mannschaft trägt ein, der Gegner hat **2 Minuten** zum Bestätigen. Bei Unentschieden das Elfmeterschießen mit angeben.\n" +
        `• **Größenvideo anfordern:** nur in den ersten ${VIDEO_WINDOW_MIN} Spielminuten, zählt zu euren ${VIDEO_LIMIT} Anforderungen pro Turnier.\n\n` +
        (open ? `**${title}**\n${cur.map((m) => `\`${lbl(m)}\` ${matchLine(m, false)}`).join("\n")}` : t.status === "fertig" ? "_Das Turnier ist beendet._" : t.status === "vorbei" ? "_Diese Runde ist beendet – die nächste Runde steht weiter unten._" : "_Die K.-o.-Phase hat noch nicht begonnen._"),
      footer: { text: "Aktualisiert sich automatisch" },
    }],
    components: open ? [row(btn("Ergebnis eintragen", "res_open", 1, { emoji: { name: "⚽" } }), btn("Größenvideo anfordern", "vid_req", 2, { emoji: { name: "📏" } }))] : [],
  };
}

/** Nachricht an den Gegner: bestätigen oder anderes Ergebnis */
export function confirmAsk(m, reporter, users, h, a, pen, state = "offen") {
  const score = `${flagOf(m.home)} **${esc(m.home)} ${h}:${a}${pen ? ` (${pen[0]}:${pen[1]} i.E.)` : ""} ${esc(m.away)}** ${flagOf(m.away)}`;
  const until = Math.floor((Date.now() + 3 * 60 * 1000) / 1000); // 2 Min. Frist + bis zu 1 Min., bis der Timer läuft
  const text = {
    offen: `📨 **${esc(reporter)}** hat für Spiel #${m.id} eingetragen: ${score}\n⏳ Bitte innerhalb von 2 Minuten bestätigen – sonst gilt das Ergebnis automatisch (spätestens <t:${until}:R>).`,
    bestaetigt: `✅ Ergebnis bestätigt: ${score}`,
    auto: `✅ Ergebnis automatisch bestätigt (keine Reaktion in 2 Minuten): ${score}`,
    konflikt: `⚠️ Unterschiedliche Ergebnisse für Spiel #${m.id} – die Turnierleitung entscheidet.`,
  }[state];
  return {
    content: state === "offen" ? `${users.map((u) => `<@${u}>`).join(" ")} ${text}` : text,
    allowed_mentions: { users: state === "offen" ? users : [] },
    components: state === "offen" ? [row(btn("Bestätigen", `res_ok:${m.id}`, 3, { emoji: { name: "✅" } }), btn("Anderes Ergebnis", "res_open", 2, { emoji: { name: "✏️" } }))] : [],
  };
}

// ---------- Regelwerk ----------
export function rulesPanel(count) {
  return {
    embeds: [{
      color: COLOR,
      title: RULES.title,
      thumbnail: { url: `${site()}/logo.jpg` },
      fields: RULES.sections.map(([name, value]) => ({ name, value })),
    }, ...(RULES.highlight ? [{
      color: 0xe02424, // rot, damit die Regel sofort auffällt
      title: RULES.highlight.title,
      description: RULES.highlight.text,
    }] : []), {
      color: COLOR,
      description: "Mit dem Button unten akzeptierst du das Regelwerk.",
      footer: { text: `${count} ${count === 1 ? "Mitglied hat" : "Mitglieder haben"} das Regelwerk akzeptiert · Erst danach ist die Anmeldung zum Cup möglich` },
    }],
    components: [row(btn("Regeln akzeptieren", "rules_ok", 3, { emoji: { name: "✅" } }))],
  };
}

export const videoMinuteModal = (limit) => ({ type: 9, data: { custom_id: "vid_min", title: "Größenvideo anfordern", components: [row({ type: 4, custom_id: "min", label: `Aktuelle Spielminute (nur bis zur ${limit}.)`, style: 1, required: true, max_length: 3, placeholder: "z. B. 23" })] } });

// ---------- Willkommen & Rollenauswahl ----------
export function welcomePost(uid, ch) {
  const link = (k, name) => (ch[k] ? `<#${ch[k]}>` : name);
  return {
    content: `<@${uid}>`,
    allowed_mentions: { users: [uid] },
    embeds: [{
      color: COLOR,
      title: "⭐ Willkommen beim Champions League Cup – dein Weg zum Titel beginnt jetzt!",
      thumbnail: { url: `${site()}/logo.jpg` },
      description:
        `Schön, dass du da bist, <@${uid}>!\n\n` +
        "Die Vereine stehen bereit, das Flutlicht ist an – jetzt beginnt dein Weg durch den Champions League Cup. Erkunde den Server, werde Teil der Community und kämpfe mit deiner Mannschaft um den Titel.\n\n" +
        `Dein erster Schritt: Lies das ${link("rules", "Regelwerk")} und wähle danach in ${link("roles", "der Rollenauswahl")} deine Rolle.`,
      fields: [
        { name: "👔 Als Manager", value: "Übernimm einen von 128 Vereinen, melde deine Mannschaft zu den Cups an, ernenne deinen Co-VM und führe deinen Klub bis ins Finale." },
        { name: "⚽ Als Spieler", value: "Verfolge Anmeldelisten, Live-Spielplan, Ergebnisse und die Hall of Fame – und sei bei jedem Cup-Abend dabei." },
        { name: "🏆 Bereit für die Königsklasse?", value: "Viel Erfolg dir und deinem Team – vielleicht steht am Ende dein Verein in der Hall of Fame!\n\n**Dein Verein. Dein Team. Dein Weg zum Titel.**" },
      ],
    }],
  };
}

export function rolesPanel() {
  return {
    embeds: [{
      color: COLOR,
      title: "🎭 ROLLENAUSWAHL",
      thumbnail: { url: `${site()}/logo.jpg` },
      description: "Wähle hier deine Rolle für den Champions League Cup.",
      fields: [
        { name: "👔 Manager", value: "Du willst einen Verein übernehmen und an den Cups teilnehmen? Die Rolle bekommst du sofort – danach suchst du dir deinen Verein aus." },
        { name: "⚽ Spieler", value: "Du spielst in einer Mannschaft mit oder willst alles verfolgen? Die Rolle bekommst du sofort." },
      ],
      footer: { text: "Wer Manager wird, verliert automatisch die Spieler-Rolle · Nochmal drücken entfernt die Rolle wieder." },
    }],
    components: [row(btn("Manager werden", "role_manager", 1, { emoji: { name: "👔" } }), btn("Spieler werden", "role_player", 3, { emoji: { name: "⚽" } }))],
  };
}

export function managerRequest(uid, rulesOk, state = "offen", byId = null) {
  const status = { offen: "", ok: `\n\n✅ **Angenommen** von <@${byId}> – Rolle Manager vergeben, Spieler entfernt.`, no: `\n\n❌ **Abgelehnt** von <@${byId}>.` }[state];
  return {
    embeds: [{ color: COLOR, title: "👔 Manager-Anfrage", description: `<@${uid}> möchte Manager werden.\nRegelwerk akzeptiert: ${rulesOk ? "✅" : "❌ noch nicht"}${status}` }],
    components: state === "offen" ? [row(btn("Annehmen", `mreq_ok:${uid}`, 3, { emoji: { name: "✅" } }), btn("Ablehnen", `mreq_no:${uid}`, 4, { emoji: { name: "❌" } }))] : [],
  };
}

// ---------- Spielfreigabe ----------
/** Freigabe einer Runde im Gruppenkanal: Ping an die Gruppe, Paarungen mit Managern */
/** Freigabe-Zeitfenster, z. B. 20:00 – 20:05 (auf die Minute abgerundet) */
export function freigabeWindow(at = Date.now()) {
  const start = Math.floor(at / 60000) * 60000, end = start + FREIGABE_MIN * 60000;
  return `🕗 **Freigabe:** <t:${unix(start)}:t> – <t:${unix(end)}:t> · spätestens <t:${unix(end)}:t> anpfeifen (<t:${unix(end)}:R>)`;
}

export function freigabePost(t, g, round, roleId, resultCh) {
  const ms = t.matches.filter((m) => m.group === g.name && m.round === round);
  const mgr = (c) => (isFreilos(c) ? "" : t.members?.[c]?.[0] ? ` <@${t.members[c][0]}>` : "");
  const pairs = ms.map((m) => {
    const free = isFreilos(m.home) || isFreilos(m.away);
    return `${flagOf(m.home)} **${esc(m.home)}**${mgr(m.home)}  vs  **${esc(m.away)}**${mgr(m.away)} ${flagOf(m.away)}${free ? "\n-# 🎟️ Freilos – wird automatisch 3:0 gewertet" : ""}${bigIVNote(t, [m.home, m.away])}`;
  });
  const playing = new Set(ms.flatMap((m) => [m.home, m.away]));
  const bye = g.teams.filter((c) => !playing.has(c) && !isFreilos(c));
  return {
    flags: V2,
    allowed_mentions: { roles: roleId ? [roleId] : [] },
    components: [box(
      txt(`${roleId ? `<@&${roleId}> ` : ""}\n## 🟢 FREIGABE · Spieltag ${round}\nGruppe ${g.name} – **ihr dürft jetzt spielen!**\n${freigabeWindow()}`),
      line(),
      txt("### ⚽ Paarungen\n" + (pairs.length ? pairs.join("\n") : "_spielfrei_") + (bye.length ? `\n\n💤 Spielfrei: ${bye.map((c) => `${flagOf(c)} ${esc(c)}`).join(", ")}` : "")),
      line(),
      txt(`📋 Nach dem Spiel das Ergebnis ${resultCh ? `in <#${resultCh}>` : "über den Button im Spielplan"} eintragen – der Gegner bestätigt.\n-# Die nächste Runde wird automatisch freigegeben, sobald alle Spiele dieser Runde bestätigt sind.`),
    )],
  };
}
