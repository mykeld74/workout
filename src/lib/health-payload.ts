/** Parses a "Health Connect Webhook" payload into rows. Pure, so it can be tested on its own. */

export type Metric =
	| 'steps'
	| 'heart_rate'
	| 'resting_heart_rate'
	| 'hrv'
	| 'weight'
	| 'exercise'
	| 'distance'
	| 'active_calories'
	| 'total_calories';

export interface Row {
	userId: string;
	metric: Metric;
	startTime: Date;
	endTime: Date | null;
	value: number;
	detail?: Record<string, unknown>;
}

type Json = Record<string, unknown>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown) => {
	if (typeof v !== 'string') return null;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
};
const list = (v: unknown): Json[] =>
	Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object').slice(0, 20_000) : [];

/** Turns one payload into rows. Unknown keys are ignored; malformed records are skipped. */
export function parsePayload(userId: string, body: Json): Row[] {
	const rows: Row[] = [];
	const add = (
		metric: Metric,
		start: Date | null,
		value: number | null,
		end: Date | null = null,
		detail?: Json
	) => {
		if (start && value !== null)
			rows.push({ userId, metric, startTime: start, endTime: end, value, detail });
	};

	for (const r of list(body.steps))
		add('steps', date(r.start_time), num(r.count), date(r.end_time));
	for (const r of list(body.heart_rate)) {
		// Either a single reading ({bpm, time}) or an aggregate ({avg, min, max, time}).
		const detail = num(r.max) !== null ? { min: num(r.min), max: num(r.max) } : undefined;
		add('heart_rate', date(r.time), num(r.avg) ?? num(r.bpm), null, detail);
	}
	for (const r of list(body.resting_heart_rate))
		add('resting_heart_rate', date(r.time), num(r.bpm));
	for (const r of list(body.heart_rate_variability))
		add('hrv', date(r.time), num(r.avg) ?? num(r.rmssd_millis));
	for (const r of list(body.weight)) add('weight', date(r.time), num(r.kilograms));
	for (const r of list(body.distance))
		add('distance', date(r.start_time), num(r.meters), date(r.end_time));
	for (const r of list(body.active_calories))
		add('active_calories', date(r.start_time), num(r.calories), date(r.end_time));
	for (const r of list(body.total_calories))
		add('total_calories', date(r.start_time), num(r.calories), date(r.end_time));
	for (const r of list(body.exercise)) {
		const start = date(r.start_time);
		const end = date(r.end_time);
		const seconds =
			num(r.duration_seconds) ?? (start && end ? (end.getTime() - start.getTime()) / 1000 : null);
		add('exercise', start, seconds, end, {
			type: typeof r.type === 'string' || typeof r.type === 'number' ? String(r.type) : null,
			distanceMeters: num(r.distance_meters),
			steps: num(r.steps)
		});
	}

	// Last one wins when a batch repeats a reading.
	const unique = new Map(rows.map((r) => [`${r.metric}|${r.startTime.getTime()}`, r]));
	return [...unique.values()];
}
