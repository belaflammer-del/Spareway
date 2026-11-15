/**
 * Verteilt überlappende Termine eines Tages auf nebeneinanderliegende Spuren.
 * Termine, die sich (auch indirekt) überschneiden, bilden eine Gruppe und teilen sich die Breite.
 */
export function layoutLanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => { const n = laneEnds.length; group.forEach((g) => (g.lanes = n)); out.push(...group); group = []; laneEnds = []; };
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(group.length === 1 ? -Infinity : groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}
