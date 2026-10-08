/** Daily and weekly activity totals for the Progress page, grouped in the user's time zone. */
import { localParts } from './body-weight.ts';
import { exerciseName, isLiftingSession, type Finished } from './week.ts';

export interface DayTotal {
	/** Local calendar day, "2026-10-06". */
	day: string;
	value: number;
}

const FULL_DAY_MS = 20 * 60 * 60 * 1000;

/**
 * Health Connect's daily step total adds the phone and the watch together. Against Samsung
 * Health's own counts (Sep 30 and Oct 3–5, 2026) it was 1.82–1.92× too high: not 2×, because
 * the phone records fewer steps than the watch. Dividing by the median ratio came within 1–3%
 * of Samsung on each day (vs 4–9% for halving). Recalibrate if the phone/watch habits change.
 */
export const DOUBLE_COUNT_FACTOR = 1.865;
/**
 * Distance ÷ steps for one source is a real step (0.6–0.75 m for you). Two sources added
 * together roughly halve it (about 0.35 m). Below this, the total is double counted.
 */
const DOUBLED_STRIDE_M = 0.55;

export interface Span {
	time: Date;
	end?: Date | null;
	value: number;
}

/** Same interval, allowing a second of clock noise between the two metrics. */
function sameSpan(a: Span, b: Span): boolean {
	if (Math.abs(a.time.getTime() - b.time.getTime()) > 1000) return false;
	if (!a.end || !b.end) return !a.end && !b.end;
	return Math.abs(a.end.getTime() - b.end.getTime()) < 1000;
}

/**
 * Undoes the phone + watch double count on step records. A record whose distance shows a
 * normal step length is a single source and is left as recorded; one with a too-short step
 * is divided by the calibrated factor. Without a matching distance, nothing can be told, so
 * the count is left as is.
 */
export function undoubleSteps(steps: Span[], distances: Span[]): Span[] {
	return steps.map((s) => {
		const meters = distances.find((d) => sameSpan(d, s))?.value;
		if (!meters || s.value <= 0) return s;
		if (meters / s.value >= DOUBLED_STRIDE_M) return s;
		return { ...s, value: s.value / DOUBLE_COUNT_FACTOR };
	});
}

/**
 * Totals per local day over the last `days` days (including today), filling gaps with 0.
 * A whole-day total already covers that day, so partial records are used only when there
 * isn't one. Two whole-day totals are the same steps from two sources; keep the larger.
 */
export function dailyTotals(
	records: Span[],
	timeZone: string,
	days: number,
	now = new Date()
): DayTotal[] {
	const full = new Map<string, number>();
	const partial = new Map<string, number>();
	for (const r of records) {
		const { day } = localParts(r.time, timeZone);
		if (isFullDay(r)) full.set(day, Math.max(full.get(day) ?? 0, r.value));
		else partial.set(day, (partial.get(day) ?? 0) + r.value);
	}
	return lastDays(days, timeZone, now).map((day) => {
		const whole = full.get(day);
		return {
			day,
			value: Math.round(whole !== undefined ? whole : (partial.get(day) ?? 0))
		};
	});
}

export function isFullDay(r: { time: Date; end?: Date | null }): boolean {
	return !!r.end && r.end.getTime() - r.time.getTime() >= FULL_DAY_MS;
}

/** The last `n` local days, oldest first. Steps back in 24h jumps, so DST is handled by the label. */
function lastDays(n: number, timeZone: string, now: Date): string[] {
	const out = new Set<string>();
	for (let i = 0; out.size < n && i < n + 2; i++) {
		out.add(localParts(new Date(now.getTime() - i * 24 * 60 * 60 * 1000), timeZone).day);
	}
	return [...out].slice(0, n).reverse();
}

/** The Monday on or before a local day, as "YYYY-MM-DD". */
function mondayOfDay(day: string): string {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return d.toISOString().slice(0, 10);
}

export interface WatchSession {
	id?: number;
	/** Calories burned in the session (Samsung's figure), if known. */
	calories?: number | null;
	time: Date;
	minutes: number;
	type: string | null;
	distanceMeters: number | null;
}

export type MinuteSpan = 'day' | 'week' | 'month';

export interface MinuteBucket {
	/** Day or week Monday as "YYYY-MM-DD", or a month as "YYYY-MM". */
	key: string;
	lifting: number;
	cardio: number;
}

export interface SessionRow {
	id?: number;
	calories: number | null;
	time: Date;
	day: string;
	name: string;
	minutes: number;
	miles: number | null;
	kind: 'lifting' | 'cardio';
}

/** Lifting by type, or a generic session overlapping a workout logged in the app. */
function kindOf(s: WatchSession, logged: Finished[]): 'lifting' | 'cardio' {
	return isLiftingSession(s, logged) ? 'lifting' : 'cardio';
}

function bucketKeys(span: MinuteSpan, count: number, timeZone: string, now: Date): string[] {
	if (span === 'day') return lastDays(count, timeZone, now);
	if (span === 'week') {
		const thisWeek = mondayOfDay(localParts(now, timeZone).day);
		const keys: string[] = [];
		for (let i = count - 1; i >= 0; i--) {
			const d = new Date(`${thisWeek}T12:00:00Z`);
			d.setUTCDate(d.getUTCDate() - i * 7);
			keys.push(d.toISOString().slice(0, 10));
		}
		return keys;
	}
	const [y, m] = localParts(now, timeZone).day.split('-').map(Number);
	const keys: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
	}
	return keys;
}

function bucketOf(time: Date, span: MinuteSpan, timeZone: string): string {
	const { day } = localParts(time, timeZone);
	if (span === 'day') return day;
	if (span === 'week') return mondayOfDay(day);
	return day.slice(0, 7);
}

/** Watch workout minutes per local day, week (Monday), or month, split into lifting and cardio. */
export function workoutMinutes(
	sessions: WatchSession[],
	logged: Finished[],
	timeZone: string,
	span: MinuteSpan,
	count: number,
	now = new Date()
): MinuteBucket[] {
	const totals = new Map(
		bucketKeys(span, count, timeZone, now).map((key) => [key, { key, lifting: 0, cardio: 0 }])
	);
	for (const s of sessions) {
		const bucket = totals.get(bucketOf(s.time, span, timeZone));
		if (bucket) bucket[kindOf(s, logged)] += s.minutes;
	}
	return [...totals.values()];
}

/** Every watch session, newest first, with a readable name and lifting/cardio label. */
export function sessionRows(
	sessions: WatchSession[],
	logged: Finished[],
	timeZone: string
): SessionRow[] {
	return sessions
		.map((s) => ({
			id: s.id,
			calories: s.calories ?? null,
			time: s.time,
			day: localParts(s.time, timeZone).day,
			name: exerciseName(s.type),
			minutes: s.minutes,
			miles: s.distanceMeters ? Math.round((s.distanceMeters / 1609.34) * 10) / 10 : null,
			kind: kindOf(s, logged)
		}))
		.sort((a, b) => b.time.getTime() - a.time.getTime());
}
