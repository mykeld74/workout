/** Daily resting heart rate from watch samples, in the user's time zone. */
import { localParts } from './body-weight.ts';

/** Awake hours. The overnight minimum is a sleep low, not a resting rate. */
export const AWAKE_START = 7 * 60;
export const AWAKE_END = 22 * 60;
/** Below this, one quiet spell would stand in for the day. */
export const MIN_SAMPLES = 20;
/** The resting rate is this percentile of awake, non-workout readings. */
export const RESTING_PERCENTILE = 0.1;

export interface RestingDay {
	/** Local calendar day, "2026-10-06". */
	day: string;
	value: number;
}

/**
 * One resting rate per day (the server computes the same thing in SQL, see `restingDays` in
 * health.ts; this version is handy for testing): the 10th percentile of heart rate while up, outside workouts.
 * Health Connect's resting-heart-rate record is the lowest beat of the day, below the
 * rate Samsung Health shows while you are up.
 */
export function restingBpmByDay(
	readings: { time: Date; value: number }[],
	sessions: { time: Date; end: Date }[],
	timeZone: string
): RestingDay[] {
	const byDay = new Map<string, number[]>();
	for (const r of readings) {
		if (sessions.some((s) => r.time >= s.time && r.time <= s.end)) continue;
		const { day, minutes } = localParts(r.time, timeZone);
		if (minutes < AWAKE_START || minutes >= AWAKE_END) continue;
		const list = byDay.get(day);
		if (list) list.push(r.value);
		else byDay.set(day, [r.value]);
	}
	return [...byDay.entries()]
		.filter(([, values]) => values.length >= MIN_SAMPLES)
		.map(([day, values]) => ({ day, value: Math.round(percentile(values, RESTING_PERCENTILE)) }))
		.sort((a, b) => a.day.localeCompare(b.day));
}

/** Linear percentile, matching the usual "percentile_cont" definition. */
function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	const index = (sorted.length - 1) * p;
	const lo = Math.floor(index);
	const hi = Math.ceil(index);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
