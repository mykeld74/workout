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
 * Totals per local day over the last `days` days (including today), filling gaps with 0.
 * Health Connect often sends a whole-day total plus partial records from other sources covering
 * the same hours; adding them would double count. So each day is the larger of its whole-day
 * totals and its partial records, never both added together.
 */
export function dailyTotals(
	records: { time: Date; end?: Date | null; value: number }[],
	timeZone: string,
	days: number,
	now = new Date()
): DayTotal[] {
	const full = new Map<string, number>();
	const partial = new Map<string, number>();
	for (const r of records) {
		const { day } = localParts(r.time, timeZone);
		const bucket = isFullDay(r) ? full : partial;
		bucket.set(day, (bucket.get(day) ?? 0) + r.value);
	}
	return lastDays(days, timeZone, now).map((day) => ({
		day,
		value: Math.round(Math.max(full.get(day) ?? 0, partial.get(day) ?? 0))
	}));
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

export interface WeekMinutes {
	/** Monday of the week, "YYYY-MM-DD". */
	week: string;
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

/** Watch workout minutes per local week (Monday start), split into lifting and cardio. */
export function weeklyMinutes(
	sessions: WatchSession[],
	logged: Finished[],
	timeZone: string,
	weeks: number,
	now = new Date()
): WeekMinutes[] {
	const thisWeek = mondayOfDay(localParts(now, timeZone).day);
	const keys: string[] = [];
	for (let i = weeks - 1; i >= 0; i--) {
		const d = new Date(`${thisWeek}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() - i * 7);
		keys.push(d.toISOString().slice(0, 10));
	}
	const totals = new Map(keys.map((k) => [k, { week: k, lifting: 0, cardio: 0 }]));
	for (const s of sessions) {
		const week = totals.get(mondayOfDay(localParts(s.time, timeZone).day));
		if (week) week[kindOf(s, logged)] += s.minutes;
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
