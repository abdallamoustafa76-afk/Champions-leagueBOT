// Warteschlange für Rollen-Änderungen. Discord begrenzt, wie schnell Rollen vergeben werden dürfen –
// deshalb werden Änderungen gesammelt und in mehreren Durchläufen abgearbeitet.
import { get, mutate } from "./store.mjs";
import { addRole, removeRole } from "./discord.mjs";

const KEY = "rolequeue";

/** ops: [{ u: Nutzer-ID, add: [Rollen-IDs], rem: [Rollen-IDs], why: "Grund" }] */
export async function enqueue(ops) {
  const clean = ops
    .map((o) => ({ u: o.u, add: (o.add || []).filter(Boolean), rem: (o.rem || []).filter(Boolean), why: o.why || "Champions League Bot" }))
    .filter((o) => o.u && (o.add.length || o.rem.length));
  if (!clean.length) return;
  await mutate(KEY, (q) => {
    for (const o of clean) q.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tries: 0, ...o });
  }, { initial: [] });
}

/** Arbeitet die Warteschlange ab, bis die Zeit um ist. */
export async function processQueue(budgetMs = 8000) {
  const deadline = Date.now() + budgetMs;
  let done = 0;
  while (Date.now() < deadline - 800) {
    const q = (await get(KEY)) || [];
    if (!q.length) break;
    const op = q[0];
    let ok = true;
    for (const r of op.add) if (!(await addRole(op.u, r, op.why))) ok = false;
    for (const r of op.rem) if (!(await removeRole(op.u, r, op.why))) ok = false;
    await mutate(KEY, (list) => {
      const i = list.findIndex((x) => x.id === op.id);
      if (i < 0) return;
      if (ok || list[i].tries >= 2) list.splice(i, 1);
      else { list[i].tries++; list.push(list.splice(i, 1)[0]); }
    }, { initial: [] });
    done++;
  }
  return done;
}
