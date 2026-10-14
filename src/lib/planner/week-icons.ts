export type WeekSpan = {
  rangeStart: number;
  rangeEnd: number;
  title: string;
};

export type WeekLane = 0 | 1 | 2;

export type WeekIconPlacement<T> = T & {
  lane: WeekLane;
  /** How many columns this overlap shares. */
  lanes: 1 | 2 | 3;
  extra: number;
};

/**
 * Overlapping icons share the column, up to three across.
 * A tighter crowd keeps the first two and counts the rest.
 */
export function layoutWeekIcons<T extends WeekSpan>(entries: T[]): WeekIconPlacement<T>[] {
  const sorted = [...entries].sort(
    (a, b) => a.rangeStart - b.rangeStart || a.title.localeCompare(b.title),
  );
  const placed: WeekIconPlacement<T>[] = [];
  let group: T[] = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    placed.push(...placeCluster(group));
    group = [];
    groupEnd = -1;
  };

  for (const entry of sorted) {
    if (group.length > 0 && entry.rangeStart < groupEnd) {
      group.push(entry);
      groupEnd = Math.max(groupEnd, entry.rangeEnd);
      continue;
    }
    flush();
    group = [entry];
    groupEnd = entry.rangeEnd;
  }
  flush();
  return placed;
}

function maxConcurrency(group: WeekSpan[]): number {
  const points: { t: number; delta: number }[] = [];
  for (const item of group) {
    points.push({ t: item.rangeStart, delta: 1 });
    points.push({ t: item.rangeEnd, delta: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let count = 0;
  let max = 0;
  for (const point of points) {
    count += point.delta;
    if (count > max) max = count;
  }
  return max;
}

function placeCluster<T extends WeekSpan>(group: T[]): WeekIconPlacement<T>[] {
  const crowd = maxConcurrency(group) > 3;
  const visible = crowd ? group.slice(0, 2) : group;
  const extra = crowd ? group.length - visible.length : 0;
  const laneEnds: number[] = [];
  const placed: WeekIconPlacement<T>[] = [];

  for (const entry of visible) {
    let lane = laneEnds.findIndex((end) => end <= entry.rangeStart);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.rangeEnd);
    } else {
      laneEnds[lane] = entry.rangeEnd;
    }
    placed.push({
      ...entry,
      lane: lane as WeekLane,
      lanes: 1,
      extra: 0,
    });
  }

  const lanes = Math.max(1, Math.min(3, laneEnds.length)) as 1 | 2 | 3;
  return placed.map((row, index) => ({
    ...row,
    lanes,
    extra: index === 0 ? extra : 0,
  }));
}
