// TOTT: Auswahl der besten Elf (4-3-3) und Bild im Champions-League-Look.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { assetDir, fonts } from "./image.mjs";
import { club } from "./data.mjs";

const GROUP = { goalkeeper: "gk", defender: "def", midfielder: "mid", forward: "fwd" };
const LINES = [
  { key: "fwd", label: "Sturm", short: "ST", n: 3 },
  { key: "mid", label: "Mittelfeld", short: "MF", n: 3 },
  { key: "def", label: "Abwehr", short: "ABW", n: 4 },
  { key: "gk", label: "Tor", short: "TW", n: 1 },
];
const NEIGH = { gk: [], def: ["mid"], mid: ["def", "fwd"], fwd: ["mid"] };

/** Beste Durchschnittsnote, bei Gleichstand Torbeteiligungen, dann Einsätze */
const cmp = (a, b) => b.avg - a.avg || (b.goals + b.assists) - (a.goals + a.assists) || b.games - a.games || b.mom - a.mom;

/**
 * players: gesammelte Werte je Spieler ({ club, name, games, rSum, rGames, goals, assists, mom, cs, pos: {defender: 2, …} })
 * Rückgabe: { lines: [{ key, label, players: [..|null] }], pot, count, minGames }
 */
export function pickTott(players) {
  const list = players.filter((p) => p.rGames > 0).map((p) => {
    const main = Object.entries(p.pos || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ...p, avg: p.rSum / p.rGames, main: GROUP[main] || "mid" };
  });
  const maxGames = Math.max(0, ...list.map((p) => p.games));
  const minGames = Math.max(1, Math.ceil(maxGames / 2)); // mindestens die Hälfte der Spiele des fleißigsten Spielers
  const ok = (p) => p.games >= minGames;
  const taken = new Set(), key = (p) => `${p.club}|${p.name}`;
  const slots = Object.fromEntries(LINES.map((l) => [l.key, []]));
  const take = (line, pool) => {
    for (const p of pool.sort(cmp)) {
      if (slots[line.key].length >= line.n) break;
      if (taken.has(key(p))) continue;
      taken.add(key(p)); slots[line.key].push(p);
    }
  };
  const order = ["gk", "def", "mid", "fwd"].map((k) => LINES.find((l) => l.key === k));
  for (const l of order) take(l, list.filter((p) => ok(p) && p.main === l.key));
  for (const l of order) take(l, list.filter((p) => ok(p) && NEIGH[l.key].includes(p.main)));
  for (const l of order) take(l, list.filter((p) => !ok(p) && p.main === l.key));
  for (const l of order) take(l, list.filter((p) => !ok(p) && NEIGH[l.key].includes(p.main)));
  const lines = LINES.map((l) => ({ ...l, players: Array.from({ length: l.n }, (_, i) => slots[l.key][i] || null) }));
  const pot = [...list.filter(ok)].sort(cmp)[0] || [...list].sort(cmp)[0] || null;
  return { lines, pot, count: taken.size, minGames };
}

// ---------- Bild ----------
const BLUE = "#2f7bff", GOLD = "#f2c94c", TEXT = "#e8edf8", MUTED = "#9fb0d4";
const rr = (x, X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
const star = (x, cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r; x.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a)); } x.closePath(); x.fill(); };
function fit(x, text, font, size, maxW, min = 10) { let s = size; while (s > min) { x.font = font.replace("{s}", s); if (x.measureText(text).width <= maxW) break; s -= 1; } x.font = font.replace("{s}", s); }
const center = (x, t, cx, y) => x.fillText(t, cx - x.measureText(t).width / 2, y);
function spaced(x, t, cx, y, sp) { const ws = [...t].map((c) => x.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (t.length - 1); let px = cx - tw / 2; [...t].forEach((c, i) => { x.fillText(c, px, y); px += ws[i] + sp; }); return tw; }
const flags = new Map();
async function flagImg(name) {
  const code = club(name)?.code; if (!code) return null;
  if (!flags.has(code)) flags.set(code, await loadImage(path.join(assetDir(), `flags/${code}.png`)).catch(() => null));
  return flags.get(code);
}

async function card(x, p, cx, y, short, isPot) {
  const w = 214, h = 168, X = cx - w / 2;
  x.shadowColor = isPot ? "rgba(242,201,76,.7)" : "rgba(0,0,0,.55)"; x.shadowBlur = isPot ? 26 : 14;
  const g = x.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, isPot ? "#3a2f0e" : "#16275e"); g.addColorStop(1, isPot ? "#1b1606" : "#0a1335");
  x.fillStyle = g; rr(x, X, y, w, h, 16); x.fill(); x.shadowBlur = 0;
  x.strokeStyle = isPot ? GOLD : "rgba(47,123,255,.85)"; x.lineWidth = isPot ? 3 : 2; rr(x, X, y, w, h, 16); x.stroke();
  if (!p) { x.fillStyle = MUTED; x.font = "600 15px Montserrat"; center(x, "keine Daten", cx, y + h / 2 - 8); return; }
  // Note + Position
  x.fillStyle = isPot ? GOLD : "#ffffff"; x.font = '54px "Bebas Neue"'; x.fillText(p.avg.toFixed(1), X + 16, y + 10);
  x.fillStyle = isPot ? GOLD : "#8fb4ff"; x.font = "800 13px Montserrat"; x.fillText(short, X + 18, y + 66);
  const fl = await flagImg(p.club); if (fl) x.drawImage(fl, X + w - 62, y + 14, 46, 46);
  if (isPot) star(x, X + w - 39, y + 76, 9, GOLD);
  // Name & Verein
  x.fillStyle = TEXT; fit(x, p.name, "700 {s}px Montserrat", 19, w - 24, 11); center(x, p.name, cx, y + 92);
  x.fillStyle = MUTED; fit(x, p.club, "600 {s}px Montserrat", 13, w - 24, 9); center(x, p.club, cx, y + 118);
  // Werte
  x.fillStyle = "rgba(255,255,255,.07)"; rr(x, X + 10, y + h - 30, w - 20, 22, 11); x.fill();
  x.fillStyle = "#cfe0ff"; x.font = "700 12px Montserrat";
  center(x, `${p.games} Sp · ${p.goals} T · ${p.assists} V${p.main === "gk" || p.main === "def" ? ` · ${p.cs} ZN` : ""}`, cx, y + h - 26);
}

export async function tottImage({ title, team, matches }) {
  fonts();
  const W = 1200, H = 1560;
  const c = createCanvas(W, H), x = c.getContext("2d");
  x.textBaseline = "top";
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#050b22"); g.addColorStop(1, "#08112e"); x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Kopf
  x.fillStyle = "#9fb7e8"; x.font = "800 18px Montserrat"; const tw = spaced(x, "TEAM OF THE TOURNAMENT", W / 2, 34, 6);
  star(x, W / 2 - tw / 2 - 24, 45, 9, GOLD); star(x, W / 2 + tw / 2 + 24, 45, 9, GOLD);
  x.font = '80px "Bebas Neue"'; const tg = x.createLinearGradient(0, 64, 0, 140); tg.addColorStop(0, "#fce284"); tg.addColorStop(1, "#c08a1a");
  x.fillStyle = tg; x.shadowColor = "rgba(0,0,0,.7)"; x.shadowBlur = 12; center(x, "TOTT", W / 2, 64); x.shadowBlur = 0;
  x.fillStyle = TEXT; fit(x, title, "600 {s}px Montserrat", 20, W - 100); center(x, title, W / 2, 148);
  x.fillStyle = MUTED; x.font = "600 15px Montserrat"; center(x, `4-3-3 · Ø-Note aus ${matches} Spielen mit EA-Daten · mind. ${team.minGames} ${team.minGames === 1 ? "Spiel" : "Spiele"}`, W / 2, 178);

  // Spielfeld
  const PX = 60, PY = 214, PW = W - 120, PH = 1080;
  x.save(); rr(x, PX, PY, PW, PH, 22); x.clip();
  for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? "#14532d" : "#166534"; x.fillRect(PX, PY + (PH / 10) * i, PW, PH / 10 + 1); }
  const vg = x.createRadialGradient(W / 2, PY + PH / 2, 100, W / 2, PY + PH / 2, 760); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(3,8,30,.65)"); x.fillStyle = vg; x.fillRect(PX, PY, PW, PH);
  x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 3;
  x.strokeRect(PX + 30, PY + 30, PW - 60, PH - 60);
  x.beginPath(); x.moveTo(PX + 30, PY + PH / 2); x.lineTo(PX + PW - 30, PY + PH / 2); x.stroke();
  x.beginPath(); x.arc(W / 2, PY + PH / 2, 95, 0, Math.PI * 2); x.stroke();
  x.strokeRect(W / 2 - 200, PY + 30, 400, 150); x.strokeRect(W / 2 - 200, PY + PH - 180, 400, 150);
  x.strokeRect(W / 2 - 90, PY + 30, 180, 60); x.strokeRect(W / 2 - 90, PY + PH - 90, 180, 60);
  x.restore();
  x.strokeStyle = BLUE; x.lineWidth = 3; rr(x, PX, PY, PW, PH, 22); x.stroke();

  // Spieler: Sturm oben, Tor unten
  const rowsY = { fwd: PY + 60, mid: PY + 320, def: PY + 580, gk: PY + 850 };
  const xs = { 1: [W / 2], 3: [W / 2 - 330, W / 2, W / 2 + 330], 4: [W / 2 - 405, W / 2 - 135, W / 2 + 135, W / 2 + 405] };
  const isPot = (p) => p && team.pot && p.name === team.pot.name && p.club === team.pot.club;
  for (const l of team.lines) {
    const pos = xs[l.n];
    const yOff = (i) => (l.key === "mid" && i === 1 ? -40 : l.key === "fwd" && i === 1 ? -20 : 0); // leichte Bögen wie bei echten Aufstellungen
    for (let i = 0; i < l.n; i++) await card(x, l.players[i], pos[i], rowsY[l.key] + yOff(i), l.short, isPot(l.players[i]));
  }

  // Spieler des Turniers
  const by = PY + PH + 30, bh = 170;
  x.fillStyle = "rgba(242,201,76,.08)"; rr(x, PX, by, PW, bh, 18); x.fill();
  x.strokeStyle = GOLD; x.lineWidth = 2; rr(x, PX, by, PW, bh, 18); x.stroke();
  const p = team.pot;
  x.fillStyle = GOLD; x.font = "800 15px Montserrat"; const lw = spaced(x, "SPIELER DES TURNIERS", W / 2, by + 20, 5);
  star(x, W / 2 - lw / 2 - 20, by + 29, 8, GOLD); star(x, W / 2 + lw / 2 + 20, by + 29, 8, GOLD);
  if (p) {
    const fl = await flagImg(p.club);
    x.fillStyle = "#ffffff"; fit(x, p.name.toUpperCase(), '{s}px "Bebas Neue"', 64, PW - 260, 28);
    const nw = x.measureText(p.name.toUpperCase()).width, fx = W / 2 - (nw + (fl ? 70 : 0)) / 2;
    if (fl) x.drawImage(fl, fx, by + 52, 54, 54);
    x.fillText(p.name.toUpperCase(), fx + (fl ? 70 : 0), by + 46);
    x.fillStyle = MUTED; x.font = "600 18px Montserrat";
    center(x, `${p.club}  ·  Ø ${p.avg.toFixed(1)}  ·  ${p.games} Spiele  ·  ${p.goals} Tore  ·  ${p.assists} Vorlagen${p.mom ? `  ·  ${p.mom}× MOTM` : ""}`, W / 2, by + 124);
  }
  x.fillStyle = "#5d6b8f"; x.font = "600 13px Montserrat"; center(x, "Champions League Bot · Daten: EA SPORTS FC Pro Clubs · T = Tore · V = Vorlagen · ZN = Zu-null-Spiele", W / 2, H - 34);
  x.strokeStyle = BLUE; x.lineWidth = 2; x.strokeRect(10, 10, W - 20, H - 20);
  return c.toBuffer("image/png");
}
