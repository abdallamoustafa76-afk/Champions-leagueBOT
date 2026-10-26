// Spitznamen auf dem Server: "Musti VM | Barcelona" bzw. "Musti CO-VM | Barcelona"
import { discord } from "./discord.mjs";
import { shortClub } from "./data.mjs";

const guild = () => process.env.DISCORD_GUILD_ID;
const TAIL = /\s+(VM|CO-VM)\s+\|.*$/;

/** Grundname ohne eventuellen alten Zusatz */
export function baseNameOf(member, user) {
  const u = user || member?.user || {};
  const raw = member?.nick || u.global_name || u.username || "Manager";
  return raw.replace(TAIL, "").trim() || "Manager";
}

/** Spitzname bauen (max. 32 Zeichen, Name wird bei Bedarf gekürzt) */
export function nickFor(base, role, club) {
  const tail = ` ${role === "co" ? "CO-VM" : "VM"} | ${shortClub(club)}`;
  const room = 32 - tail.length;
  const name = base.length > room ? base.slice(0, Math.max(1, room - 1)) + "…" : base;
  return (name + tail).slice(0, 32);
}

/** Spitzname setzen; null = zurück auf den ursprünglichen (keinen) Spitznamen */
export const setNick = (uid, nick) => discord(`/guilds/${guild()}/members/${uid}`, "PATCH", { nick: nick ?? null }, { reason: "Champions League Bot: Mannschaft" });
