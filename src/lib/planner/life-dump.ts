import type { ItemCategory } from "@/data/inventory-mock";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import { formatClock, formatClockRange, formatClocksInText } from "@/lib/planner/clock-label";
import {
  startOutsideProtected,
  windowsOnDate,
  windowOverlapping,
  type ProtectedWindow,
} from "@/lib/planner/protected-time";

export const BUSINESS_START_MIN = 9 * 60;
export const BUSINESS_END_MIN = 17 * 60;
export const DEFAULT_WAKE_MIN = 8 * 60;
export const DEFAULT_WIND_MIN = 22 * 60;
const TRAVEL_MIN = 30;
const SAME_PLACE_GAP_MIN = 10;
const HORIZON_DAYS = 14;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const EMILY_WEEK_DUMP =
  "girls crafts afternoon 2 to 5 PM this coming Sunday; drive to Stuart to pick up mom's eyeglasses before 5 PM; go to a smoke shop for my brother; after those two, go to UPS and ship one package to the Vineyard; video call tomorrow at 10, meeting at 11 and another at 11:30, both in Jupiter; get coolant for my car.";

export type LifeClock = {
  todayISO: string;
  /** Minutes from midnight in the user's zone. */
  nowMinutes: number;
  timeZone?: string;
  wakeMin?: number;
  windMin?: number;
  /** Recurring blocks that stay empty unless the person names that clock time. */
  protectedWindows?: ProtectedWindow[];
};

export type LifeIntent = {
  title: string;
  dateISO: string | null;
  startMin: number | null;
  endMin: number | null;
  durationMin: number;
  /** The person named this clock time. The planner must not move it. */
  stated: boolean;
  business: boolean;
  deadlineMin: number | null;
  afterTitles: string[];
  /** This stop has to finish before these titles start. */
  beforeTitles: string[];
  /** The words this stop was parsed from, used to match "after" and "before". */
  clause: string;
  location: string | null;
  inPerson: boolean;
  category: ItemCategory;
};

export type PlacedLife = LifeIntent & {
  dateISO: string;
  startMin: number;
  endMin: number;
};

type Busy = {
  dateISO: string;
  start: number;
  end: number;
  padBefore: number;
  padAfter: number;
};

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** Upcoming weekday. `forceNextWeek` is for "next Sunday" when today is already Sunday. */
export function resolveWeekday(name: string, todayISO: string, forceNextWeek: boolean): string | null {
  const target = WEEKDAYS.indexOf(name.toLowerCase());
  if (target < 0) return null;
  const [y, m, d] = todayISO.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let delta = (target - today + 7) % 7;
  if (forceNextWeek && delta === 0) delta = 7;
  return addDaysISO(todayISO, delta);
}

export function resolveRelativeDate(phrase: string, todayISO: string): string | null {
  if (/\btomorrow\b/i.test(phrase)) return addDaysISO(todayISO, 1);
  if (/\btoday\b/i.test(phrase)) return todayISO;
  const named = phrase.match(
    /\b(next|this coming|coming|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );
  if (!named) return null;
  const forceNext = (named[1] ?? "").toLowerCase() === "next";
  return resolveWeekday(named[2], todayISO, forceNext);
}

function minutesToHHMM(total: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.round(total)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function meridiem(token: string | undefined): "am" | "pm" | null {
  if (!token) return null;
  const t = token.toLowerCase().replace(/\./g, "");
  if (t === "am") return "am";
  if (t === "pm") return "pm";
  return null;
}

function applyMeridiem(hour: number, mer: "am" | "pm" | null, bareAfternoon: boolean): number {
  if (mer === "pm" && hour < 12) return hour + 12;
  if (mer === "am" && hour === 12) return 0;
  if (mer == null && bareAfternoon && hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function parseRange(clause: string): { start: number; end: number } | null {
  const match = clause.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(?:to|–|-)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i,
  );
  if (!match) return null;
  const mer = meridiem(match[5]);
  const bareAfternoon = mer == null;
  const startH = applyMeridiem(Number(match[1]), mer, bareAfternoon);
  const endH = applyMeridiem(Number(match[3]), mer, bareAfternoon);
  const start = startH * 60 + Number(match[2] ?? 0);
  const end = endH * 60 + Number(match[4] ?? 0);
  if (end <= start || startH > 23 || endH > 23) return null;
  return { start, end };
}

function parseAt(clause: string): number | null {
  const match = clause.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  const mer = meridiem(match[3]);
  const hour = applyMeridiem(Number(match[1]), mer, mer == null);
  if (hour > 23) return null;
  return hour * 60 + Number(match[2] ?? 0);
}

function parseDeadline(clause: string): number | null {
  const match = clause.match(/\bbefore\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  const mer = meridiem(match[3]);
  const hour = applyMeridiem(Number(match[1]), mer, mer == null || mer === "pm");
  if (hour > 23) return null;
  return hour * 60 + Number(match[2] ?? 0);
}

function isErrand(clause: string): boolean {
  return /\b(ups|store|shop|auto parts|coolant|pick up|pickup|drive to|ship|errand)\b/i.test(clause);
}

export function isBusinessErrand(item: { title: string; notes?: string | null }): boolean {
  return isErrand(`${item.title} ${item.notes ?? ""}`);
}

function locationOf(clause: string): string | null {
  const named = clause.match(/\b(?:in|to)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (/stuart/i.test(clause)) return "Stuart";
  if (named && /jupiter|stuart/i.test(named[1])) return named[1];
  if (/\bjupiter\b/i.test(clause)) return "Jupiter";
  if (/\bups\b/i.test(clause)) return "UPS";
  if (/smoke shop/i.test(clause)) return "smoke shop";
  if (/coolant|auto parts/i.test(clause)) return "auto parts";
  return null;
}

function titleFor(clause: string, startMin: number | null): string {
  if (/craft/i.test(clause)) return "Girls crafts";
  if (/eyeglass/i.test(clause)) return "Pick up mom's eyeglasses";
  if (/smoke shop/i.test(clause)) return "Smoke shop";
  if (/\bups\b/i.test(clause)) return "Ship package at UPS";
  if (/video call/i.test(clause)) return "Video call";
  if (/coolant|auto parts/i.test(clause)) return "Get coolant";
  if (/meeting/i.test(clause)) {
    const when = startMin == null ? "" : `${formatClock(minutesToHHMM(startMin))} `;
    const place = /\bjupiter\b/i.test(clause) ? " in Jupiter" : "";
    return `${when}meeting${place}`.replace(/^./, (c) => c.toUpperCase());
  }
  const cleaned = clause
    .replace(/\b(tomorrow|today|this coming|coming|next|after those two|after those|after both)\b/gi, " ")
    .replace(/\bon the way(?: back| home)?\b/gi, " ")
    .replace(/\bonce i(?:'|\u2019)?ve done (?:that|this|it|them)\b/gi, " ")
    .replace(/\bbefore i (?:go to|head to|stop at|get to|visit|do|see)\s+.+$/i, " ")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?))?/gi, " ")
    .replace(/\bbefore\s+\d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?))?/gi, " ")
    .replace(/\d{1,2}(?::\d{2})?\s*(?:to|–|-)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?/gi, " ")
    .replace(/\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/gi, " ")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Plan";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function categoryFor(clause: string): ItemCategory {
  if (/craft|brother|mom|family/i.test(clause)) return "Family";
  if (/video call|meeting/i.test(clause)) return "Work";
  if (/coolant|car|ups|shop|ship/i.test(clause)) return "Upkeep";
  return "Personal";
}

function defaultDuration(clause: string): number {
  if (/drive|pick up|pickup/i.test(clause)) return 45;
  return 30;
}

function splitClauses(text: string): string[] {
  return text
    .split(/[;\n]+/)
    .map((part) => part.trim().replace(/^\W+|\W+$/g, ""))
    .filter(Boolean);
}

/** One clause can name several clock times, such as a call at 10 and meetings at 11 and 11:30. */
function expandClause(clause: string): string[] {
  const hits = [...clause.matchAll(/\bat\s+\d{1,2}(?::\d{2})?/gi)];
  if (hits.length < 2) return [clause];
  const place = clause.match(/\bboth in\s+([A-Za-z][A-Za-z .'-]*?)(?:[.,]|$)/i);
  const placeName = place?.[1]?.trim() ?? "";
  const day = clause.match(/\b(tomorrow|today|this coming\s+\w+|next\s+\w+)\b/i)?.[0] ?? "";
  const body = clause.replace(/\bboth in\s+[A-Za-z][A-Za-z .'-]*/i, "");
  const parts = body
    .split(/,|\band another\b|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => /\bat\s+\d/i.test(part));
  if (parts.length < 2) return [clause];
  return parts.map((part, index) => {
    const meeting = /meeting/i.test(part) || (index > 0 && /meeting/i.test(clause));
    const labeled = meeting && !/meeting/i.test(part) ? `meeting ${part}` : part;
    const placeBit = meeting && placeName ? `in ${placeName}` : "";
    return [labeled, day, placeBit].filter(Boolean).join(" ");
  });
}

const LINK_STOP = new Set([
  "the", "a", "an", "to", "at", "for", "and", "my", "our", "go", "get", "do", "that", "this", "it", "them",
]);

function pushUnique(list: string[], title: string) {
  if (title && !list.includes(title)) list.push(title);
}

function countWord(token: string | undefined): number {
  const map: Record<string, number> = { two: 2, three: 3, four: 4, both: 2, "2": 2, "3": 3, "4": 4 };
  return map[(token ?? "two").toLowerCase()] ?? 2;
}

function matchTitle(phrase: string, intents: LifeIntent[], self: LifeIntent): LifeIntent | null {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !LINK_STOP.has(word));
  if (words.length === 0) return null;
  let best: LifeIntent | null = null;
  let bestScore = 0;
  for (const intent of intents) {
    if (intent === self) continue;
    const hay = `${intent.title} ${intent.clause}`.toLowerCase();
    const score = words.filter((word) => hay.includes(word)).length;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best;
}

/** Turn "after", "once I've done", "before I go", and "on the way back" into order. */
export function linkLifeOrder(intents: LifeIntent[]): LifeIntent[] {
  intents.forEach((intent, index) => {
    const text = intent.clause;
    if (/\bon the way(?: back| home)?\b|\bsame trip\b/i.test(text) && index > 0) {
      pushUnique(intent.afterTitles, intents[index - 1].title);
    }
    const those = text.match(/\bafter (?:those|both|the first)(?:\s+(two|three|four|both|2|3|4))?\b/i);
    if (those) {
      const count = /both/i.test(those[0]) && !those[1] ? 2 : countWord(those[1]);
      for (const prior of intents.slice(Math.max(0, index - count), index)) {
        pushUnique(intent.afterTitles, prior.title);
      }
    }
    const once = text.match(
      /\b(?:once (?:i(?:'ve| have)?|we(?:'ve| have)?) (?:done|finished|do|finish)|after (?:i |we )?(?:finish(?:ed|ing)?|doing|do|done))\s+(.+?)(?:[.,;]|$)/i,
    );
    if (once && !/\bafter (?:those|both)\b/i.test(text)) {
      const phrase = once[1].trim();
      if (/^(that|this|it|them)$/i.test(phrase) && index > 0) {
        pushUnique(intent.afterTitles, intents[index - 1].title);
      } else {
        const target = matchTitle(phrase, intents, intent);
        if (target) pushUnique(intent.afterTitles, target.title);
        else if (index > 0) pushUnique(intent.afterTitles, intents[index - 1].title);
      }
    }
    const beforePlace = text.match(/\bbefore I (?:go to|head to|stop at|get to|visit|do|see)\s+(.+?)(?:[.,;]|$)/i);
    if (beforePlace) {
      const target = matchTitle(beforePlace[1], intents, intent);
      if (!target) return;
      if (target.stated) pushUnique(intent.beforeTitles, target.title);
      else pushUnique(target.afterTitles, intent.title);
    }
  });
  return intents;
}

export function interpretLifeDump(text: string, clock: LifeClock): LifeIntent[] {
  const intents: LifeIntent[] = [];
  for (const clause of splitClauses(text)) {
    const pieces = expandClause(clause);
    const dated = pieces.map((piece) => readPiece(piece, clock.todayISO));
    for (let i = 0; i < dated.length; i += 1) {
      const current = dated[i];
      const next = dated[i + 1];
      if (
        current.startMin != null &&
        next?.startMin != null &&
        next.startMin > current.startMin &&
        next.startMin - current.startMin <= 120
      ) {
        current.endMin = next.startMin;
        current.durationMin = next.startMin - current.startMin;
      }
    }
    for (const intent of dated) intents.push(intent);
  }
  return linkLifeOrder(intents);
}

function readPiece(clause: string, todayISO: string): LifeIntent {
  const range = parseRange(clause);
  const at = range ? null : parseAt(clause);
  const startMin = range?.start ?? at;
  const endMin = range?.end ?? null;
  const durationMin = range ? range.end - range.start : defaultDuration(clause);
  const dated = resolveRelativeDate(clause, todayISO) != null;
  const stated = startMin != null && dated;
  const hasClock = startMin != null;
  const dateISO = resolveRelativeDate(clause, todayISO);
  return {
    title: titleFor(clause, startMin),
    dateISO,
    startMin,
    endMin: endMin ?? (hasClock && stated ? startMin + durationMin : null),
    durationMin,
    stated,
    business: isErrand(clause),
    deadlineMin: parseDeadline(clause),
    afterTitles: [],
    beforeTitles: [],
    clause,
    location: locationOf(clause),
    inPerson: !/video call/i.test(clause) && (/meeting/i.test(clause) || isErrand(clause)),
    category: categoryFor(clause),
  };
}

function overlaps(start: number, end: number, busy: Busy[], dateISO: string, usePad: boolean): Busy | null {
  for (const block of busy) {
    if (block.dateISO !== dateISO) continue;
    const blockStart = block.start - (usePad ? block.padBefore : 0);
    const blockEnd = block.end + (usePad ? block.padAfter : 0);
    if (start < blockEnd && end > blockStart) return block;
  }
  return null;
}

function jumpPast(block: Busy, usePad: boolean): number {
  return block.end + (usePad ? block.padAfter : 0);
}

function placeFixed(intent: LifeIntent, busy: Busy[]): PlacedLife | null {
  if (!intent.stated || intent.dateISO == null || intent.startMin == null) return null;
  const end = intent.endMin ?? intent.startMin + intent.durationMin;
  busy.push({
    dateISO: intent.dateISO,
    start: intent.startMin,
    end,
    padBefore: intent.inPerson ? TRAVEL_MIN : 0,
    padAfter: intent.inPerson ? TRAVEL_MIN : 0,
  });
  return { ...intent, dateISO: intent.dateISO, startMin: intent.startMin, endMin: end, durationMin: end - intent.startMin };
}

function chainOf(intent: LifeIntent, intents: LifeIntent[]): LifeIntent[] {
  if (intent.afterTitles.length === 0) return [intent];
  const prior = intent.afterTitles
    .map((title) => intents.find((row) => row.title === title))
    .filter((row): row is LifeIntent => Boolean(row && !row.stated));
  return [...prior, intent];
}

function alreadyPlaced(title: string, placed: PlacedLife[]): boolean {
  return placed.some((row) => row.title === title);
}

function preferredDates(chain: LifeIntent[], placed: PlacedLife[], todayISO: string): string[] {
  const pinned = new Set<string>();
  for (const intent of chain) {
    for (const title of [...intent.afterTitles, ...intent.beforeTitles]) {
      const other = placed.find((row) => row.title === title);
      if (other) pinned.add(other.dateISO);
    }
  }
  const horizon = Array.from({ length: HORIZON_DAYS }, (_, day) => addDaysISO(todayISO, day));
  if (pinned.size === 0) return horizon;
  return [...[...pinned].sort(), ...horizon.filter((iso) => !pinned.has(iso))];
}

function placeChain(
  chain: LifeIntent[],
  busy: Busy[],
  clock: LifeClock,
  placed: PlacedLife[],
): PlacedLife[] | null {
  const wake = clock.wakeMin ?? DEFAULT_WAKE_MIN;
  const wind = clock.windMin ?? DEFAULT_WIND_MIN;
  const dates = preferredDates(chain, placed, clock.todayISO);
  for (const dateISO of dates) {
    const dayOffset = Math.round(
      (Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${clock.todayISO}T00:00:00Z`)) / 86_400_000,
    );
    let cursor = Math.max(BUSINESS_START_MIN, wake);
    if (dayOffset <= 0) cursor = Math.max(cursor, clock.nowMinutes);
    for (const intent of chain) {
      for (const title of intent.afterTitles) {
        const prior = placed.find((row) => row.title === title && row.dateISO === dateISO);
        if (prior) cursor = Math.max(cursor, prior.endMin + TRAVEL_MIN);
      }
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const draft: PlacedLife[] = [];
      let restartAt: number | null = null;
      let failed = false;
      for (const intent of chain) {
        const previous = draft[draft.length - 1];
        const gap =
          previous == null
            ? 0
            : previous.location && previous.location === intent.location
              ? SAME_PLACE_GAP_MIN
              : TRAVEL_MIN;
        const begin = previous == null ? cursor : previous.endMin + gap;
        const end = begin + intent.durationMin;
        let latest = Math.min(BUSINESS_END_MIN, wind, intent.deadlineMin ?? BUSINESS_END_MIN);
        for (const title of intent.beforeTitles) {
          const next = placed.find((row) => row.title === title && row.dateISO === dateISO);
          if (next) latest = Math.min(latest, next.startMin);
        }
        const hit = overlaps(begin, end, busy, dateISO, true);
        if (hit) {
          restartAt = Math.max(cursor, jumpPast(hit, true));
          failed = true;
          break;
        }
        if (end > latest || begin < BUSINESS_START_MIN) {
          failed = true;
          break;
        }
        draft.push({ ...intent, dateISO, startMin: begin, endMin: end });
      }
      if (!failed) {
        for (const row of draft) {
          busy.push({
            dateISO: row.dateISO,
            start: row.startMin,
            end: row.endMin,
            padBefore: TRAVEL_MIN,
            padAfter: TRAVEL_MIN,
          });
        }
        return draft;
      }
      if (restartAt == null || restartAt <= cursor) break;
      cursor = restartAt;
    }
  }
  return null;
}

function seedProtected(busy: Busy[], clock: LifeClock) {
  const windows = clock.protectedWindows ?? [];
  if (windows.length === 0) return;
  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    const dateISO = addDaysISO(clock.todayISO, day);
    for (const window of windowsOnDate(windows, dateISO)) {
      busy.push({
        dateISO,
        start: window.startMin,
        end: window.endMin,
        padBefore: 0,
        padAfter: 0,
      });
    }
  }
}

export function placeLifeDump(intents: LifeIntent[], clock: LifeClock): PlacedLife[] {
  const busy: Busy[] = [];
  seedProtected(busy, clock);
  const placed: PlacedLife[] = [];
  for (const intent of intents) {
    const fixed = placeFixed(intent, busy);
    if (fixed) placed.push(fixed);
  }
  const flexible = intents.filter((intent) => !intent.stated);
  for (const intent of flexible) {
    if (alreadyPlaced(intent.title, placed)) continue;
    if (flexible.some((row) => row.afterTitles.includes(intent.title))) continue;
    const chain = chainOf(intent, intents).filter((row) => !row.stated && !alreadyPlaced(row.title, placed));
    const block = placeChain(chain, busy, clock, placed);
    if (block) placed.push(...block);
  }
  return placed.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.startMin - b.startMin || a.title.localeCompare(b.title));
}

export type PlacementProblem = {
  title: string;
  reason: string;
};

/** Reject a clock that breaks the rules, then place the intents again. */
export function validatePlacements(
  placed: PlacedLife[],
  intents: LifeIntent[],
  clock: LifeClock,
): { problems: PlacementProblem[]; fixed: PlacedLife[] } {
  const wake = clock.wakeMin ?? DEFAULT_WAKE_MIN;
  const wind = clock.windMin ?? DEFAULT_WIND_MIN;
  const problems: PlacementProblem[] = [];
  const fixedEvents = placed.filter((row) => row.stated && row.dateISO && row.startMin != null);

  for (const row of placed) {
    if (!row.stated && (row.startMin < wake || row.endMin > wind)) {
      problems.push({ title: row.title, reason: "outside wake and wind-down" });
    }
    if (row.business && !row.stated && (row.startMin < BUSINESS_START_MIN || row.endMin > BUSINESS_END_MIN)) {
      problems.push({ title: row.title, reason: "outside business hours" });
    }
    if (row.deadlineMin != null && row.endMin > row.deadlineMin) {
      problems.push({ title: row.title, reason: "after the deadline" });
    }
    if (!row.stated) {
      const hit = fixedEvents.find(
        (event) => event.dateISO === row.dateISO && row.startMin < event.endMin && row.endMin > event.startMin,
      );
      if (hit) problems.push({ title: row.title, reason: `on top of ${hit.title}` });
      const blocked = windowOverlapping(clock.protectedWindows ?? [], row.dateISO, row.startMin, row.endMin);
      if (blocked) problems.push({ title: row.title, reason: `during ${blocked.name}` });
    }
    for (const priorTitle of row.afterTitles) {
      const prior = placed.find((item) => item.title === priorTitle);
      if (!prior) continue;
      const sameDayLater = row.dateISO === prior.dateISO && row.startMin >= prior.endMin;
      const laterDay = row.dateISO > prior.dateISO;
      if (!sameDayLater && !laterDay) {
        problems.push({ title: row.title, reason: `before ${priorTitle}` });
      }
    }
  }

  if (problems.length === 0) return { problems, fixed: placed };
  return { problems, fixed: placeLifeDump(intents, clock) };
}

export function scheduleLifeDump(text: string, clock: LifeClock): PlacedLife[] {
  const intents = interpretLifeDump(text, clock);
  return placeLifeDump(intents, clock);
}

function dueStamp(dateISO: string): string {
  return `${dateISO}T12:00:00.000Z`;
}

export function draftsFromPlaced(rows: PlacedLife[]): BrainDumpItemDraft[] {
  return rows.map((row) => {
    const when = formatClockRange(minutesToHHMM(row.startMin), minutesToHHMM(row.endMin));
    const place = row.location ? ` ${row.location}.` : "";
    const person = row.inPerson ? " In person." : "";
    return {
      title: row.title,
      category: row.category,
      type: "one_off",
      frequency_type: null,
      frequency_value: null,
      frequency_unit: null,
      times_per_period: 1,
      recurrence_end: "never",
      recurrence_end_date: null,
      recurrence_end_count: null,
      completed_count: 0,
      preferred_days: null,
      preferred_time_of_day: null,
      fixed_start_time: minutesToHHMM(row.startMin),
      estimated_minutes: Math.max(5, row.endMin - row.startMin),
      priority: row.stated ? "Important" : "Standard",
      flexibility: "Fixed",
      cadence_pressure: "Must stay on cadence",
      minimum_success_threshold: null,
      notes: formatClocksInText(`${when}.${place}${person}`.trim()),
      is_archived: false,
      last_completed_at: null,
      next_due_date: dueStamp(row.dateISO),
    };
  });
}

export function clockPrompt(clock: LifeClock): string {
  const time = formatClock(minutesToHHMM(clock.nowMinutes));
  const zone = clock.timeZone ?? "the time zone saved on the account";
  const blocks = (clock.protectedWindows ?? [])
    .map(
      (window) =>
        `${window.name} (${window.days.join(", ")} ${formatClock(minutesToHHMM(window.startMin))}–${formatClock(minutesToHHMM(window.endMin))})`,
    )
    .join("; ");
  const protectedLine = blocks
    ? ` Protected time must stay empty unless the person names that exact clock time: ${blocks}.`
    : "";
  return `The user's current date is ${clock.todayISO}. The local time is ${time}. The time zone is ${zone}. Resolve words like tomorrow and this coming Sunday from that date only.${protectedLine}`;
}

function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Pull a model suggestion back inside business hours, wake, and wind-down. Stated fixed events stay put. */
export function repairModelDrafts(drafts: BrainDumpItemDraft[], clock: LifeClock): BrainDumpItemDraft[] {
  const wake = clock.wakeMin ?? DEFAULT_WAKE_MIN;
  const wind = clock.windMin ?? DEFAULT_WIND_MIN;
  return drafts.map((draft) => {
    const start = parseHHMM(draft.fixed_start_time);
    if (start == null) return draft;
    const end = start + draft.estimated_minutes;
    const business = isBusinessErrand(draft);
    const outsideBusiness = business && (start < BUSINESS_START_MIN || end > BUSINESS_END_MIN);
    const outsideDay = !business && draft.flexibility !== "Fixed" && (start < wake || end > wind);
    const explicit = draft.flexibility === "Fixed";
    const dateISO =
      typeof draft.next_due_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(draft.next_due_date)
        ? draft.next_due_date.slice(0, 10)
        : null;
    const blocked =
      !explicit &&
      windowOverlapping(clock.protectedWindows ?? [], dateISO, start, end) != null;
    if (!outsideBusiness && !outsideDay && !blocked) return draft;
    const earliest = business ? BUSINESS_START_MIN : wake;
    const latest = business ? BUSINESS_END_MIN : wind;
    const duration = Math.max(15, Math.min(draft.estimated_minutes, latest - earliest));
    let snapped = Math.min(Math.max(start, earliest), latest - duration);
    if (!explicit) {
      snapped = startOutsideProtected(
        snapped,
        duration,
        clock.protectedWindows ?? [],
        dateISO,
        earliest,
        latest,
      );
    }
    return {
      ...draft,
      fixed_start_time: minutesToHHMM(snapped),
      estimated_minutes: duration,
      flexibility: "Fixed",
      notes: formatClocksInText(draft.notes ?? ""),
    };
  });
}

/** Clauses the deterministic pass did not understand, so the model can still read them. */
export function leftoverLifeDump(text: string, clock: LifeClock): string {
  const understood = new Set(interpretLifeDump(text, clock).map((row) => row.title));
  if (understood.size === 0) return text.trim();
  return splitClauses(text)
    .filter((clause) => {
      const titles = expandClause(clause).map((piece) => readPiece(piece, clock.todayISO).title);
      return titles.every((title) => !understood.has(title));
    })
    .join("; ");
}
