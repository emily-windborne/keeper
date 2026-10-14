export type WeekSpan = {
  rangeStart: number;
  rangeEnd: number;
  title: string;
};

export type WeekIconPlacement<T> = T & { lane: 0 | 1; extra: number };

/**
 * Up to two icons share a time. Anything else in that cluster is a +N on the first icon.
 */
export function layoutWeekIcons<T extends WeekSpan>(entries: T[]): WeekIconPlacement<T>[] {
  const sorted = [...entries].sort(
    (a, b) => a.rangeStart - b.rangeStart || a.title.localeCompare(b.title),
  );
  const shown: WeekIconPlacement<T>[] = [];
  const clusterEnd: number[] = [];
  for (const entry of sorted) {
    const group = shown
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row, index }) => row.rangeStart < entry.rangeEnd && entry.rangeStart < clusterEnd[index],
      );
    if (group.length === 0) {
      shown.push({ ...entry, lane: 0, extra: 0 });
      clusterEnd.push(entry.rangeEnd);
      continue;
    }
    const nextEnd = Math.max(entry.rangeEnd, ...group.map(({ index }) => clusterEnd[index]));
    for (const { index } of group) clusterEnd[index] = nextEnd;
    const lanes = new Set(group.map(({ row }) => row.lane));
    if (!lanes.has(1)) {
      shown.push({ ...entry, lane: 1, extra: 0 });
      clusterEnd.push(nextEnd);
      continue;
    }
    const host = group.find(({ row }) => row.lane === 0) ?? group[0];
    host.row.extra += 1;
  }
  return shown;
}
