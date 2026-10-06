import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { healthKey, healthSample } from '#lib/server/db/schema.ts';
import { parsePayload } from '#lib/health-payload.ts';
import { undoubleSteps } from '#lib/workout/activity.ts';
import { AWAKE_END, AWAKE_START, MIN_SAMPLES, RESTING_PERCENTILE } from '#lib/workout/heart.ts';

/**
 * Samsung Health → Health Connect → the "Health Connect Webhook" phone app → POST /api/health.
 * Payload format: https://github.com/mcnaveen/health-connect-webhook/blob/main/docs/webhook.md
 */

export const KG_TO_LB = 2.20462;
const DAY_MS = 24 * 60 * 60 * 1000;

import type { Metric } from '#lib/health-payload.ts';

// ─── Keys ────────────────────────────────────────────────────────────────────

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

/** Makes a new key (replacing any old one). The plain key is shown once and never stored. */
export async function createKey(userId: string): Promise<string> {
	const key = `hk_${randomBytes(24).toString('base64url')}`;
	await db
		.insert(healthKey)
		.values({ userId, keyHash: hash(key) })
		.onConflictDoUpdate({
			target: healthKey.userId,
			set: { keyHash: hash(key), createdAt: new Date(), lastUsedAt: null }
		});
	return key;
}

export async function revokeKey(userId: string) {
	await db.delete(healthKey).where(eq(healthKey.userId, userId));
}

export async function keyStatus(userId: string) {
	const [row] = await db
		.select({ createdAt: healthKey.createdAt, lastUsedAt: healthKey.lastUsedAt })
		.from(healthKey)
		.where(eq(healthKey.userId, userId));
	return row ?? null;
}

/** The user a key belongs to, or null. Marks the key as used. */
export async function userForKey(key: string): Promise<string | null> {
	if (!key.startsWith('hk_') || key.length > 100) return null;
	const [row] = await db
		.update(healthKey)
		.set({ lastUsedAt: new Date() })
		.where(eq(healthKey.keyHash, hash(key)))
		.returning({ userId: healthKey.userId });
	return row?.userId ?? null;
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

export async function ingest(userId: string, body: Json): Promise<number> {
	const rows = parsePayload(userId, body);
	for (let i = 0; i < rows.length; i += 500) {
		await db
			.insert(healthSample)
			.values(rows.slice(i, i + 500))
			.onConflictDoUpdate({
				target: [healthSample.userId, healthSample.metric, healthSample.startTime],
				set: {
					value: sql`excluded.value`,
					endTime: sql`excluded.end_time`,
					// A session the user removed stays removed when the phone sends it again.
					detail: sql`case when ${sql.raw('"health_sample"."detail"')}->>'ignored' = 'true' then ${sql.raw('"health_sample"."detail"')} else excluded.detail end`,
					receivedAt: new Date()
				}
			});
	}
	return rows.length;
}

/** Hides a watch session everywhere; it stays hidden if the phone sends it again. */
export async function ignoreSession(userId: string, id: number) {
	await db
		.update(healthSample)
		.set({
			detail: sql`coalesce(${healthSample.detail}, '{}'::jsonb) || '{"ignored": true}'::jsonb`
		})
		.where(
			and(
				eq(healthSample.id, id),
				eq(healthSample.userId, userId),
				eq(healthSample.metric, 'exercise')
			)
		);
}

export async function deleteHealthData(userId: string) {
	await db.delete(healthSample).where(eq(healthSample.userId, userId));
}

// ─── Reading it back ─────────────────────────────────────────────────────────

export async function metricCounts(userId: string) {
	const rows = await db
		.select({
			metric: healthSample.metric,
			count: sql<number>`count(*)::int`,
			// Raw SQL comes back as text, not a Date.
			latest: sql<string>`max(${healthSample.startTime})`
		})
		.from(healthSample)
		.where(eq(healthSample.userId, userId))
		.groupBy(healthSample.metric);
	return rows.map((r) => ({ ...r, latest: new Date(`${r.latest.replace(' ', 'T')}Z`) }));
}

/** Readings the user hasn't removed. */
const notIgnored = sql`coalesce(${healthSample.detail}->>'ignored', '') <> 'true'`;

async function samples(userId: string, metric: Metric, since: Date, until = new Date()) {
	return db
		.select({
			id: healthSample.id,
			time: healthSample.startTime,
			end: healthSample.endTime,
			value: healthSample.value,
			detail: healthSample.detail
		})
		.from(healthSample)
		.where(
			and(
				eq(healthSample.userId, userId),
				eq(healthSample.metric, metric),
				gte(healthSample.startTime, since),
				lte(healthSample.startTime, until),
				notIgnored
			)
		)
		.orderBy(asc(healthSample.startTime));
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Readiness {
	status: 'good' | 'easy' | 'unknown';
	message: string;
	restingHr: { today: number; baseline: number } | null;
	hrv: { today: number; baseline: number } | null;
}

/**
 * Compares the latest resting heart rate and HRV with the median of the 14 days before.
 * Resting HR 5+ bpm above normal, or HRV 15%+ below, suggests going easier today.
 * Needs at least 5 earlier readings to say anything.
 */
export async function readiness(userId: string, timeZone = 'UTC'): Promise<Readiness> {
	const now = Date.now();
	const since = new Date(now - 15 * DAY_MS);
	const [resting, hrv] = await Promise.all([
		restingDays(userId, timeZone, since),
		samples(userId, 'hrv', since)
	]);

	const compare = (rows: { time: Date; value: number }[]) => {
		const recent = rows.filter((r) => r.time.getTime() > now - 36 * 60 * 60 * 1000);
		const before = rows.filter((r) => r.time.getTime() <= now - 24 * 60 * 60 * 1000);
		const today = recent.at(-1)?.value;
		const baseline = median(before.map((r) => r.value));
		if (today === undefined || baseline === null || before.length < 5) return null;
		return { today: Math.round(today), baseline: Math.round(baseline) };
	};

	const r = compare(resting.map((d) => ({ time: d.date, value: d.value })));
	const h = compare(hrv);
	if (!r && !h) {
		return {
			status: 'unknown',
			message: 'Not enough watch data yet. Readiness needs about a week of readings.',
			restingHr: null,
			hrv: null
		};
	}

	const reasons: string[] = [];
	if (r && r.today >= r.baseline + 5)
		reasons.push(`resting heart rate is ${r.today} (usually ${r.baseline})`);
	if (h && h.today <= h.baseline * 0.85)
		reasons.push(`HRV is ${h.today} ms (usually ${h.baseline})`);

	const normal =
		r && h
			? 'Resting heart rate and HRV look normal.'
			: r
				? 'Resting heart rate looks normal.'
				: 'HRV looks normal.';

	return reasons.length
		? {
				status: 'easy',
				message: `Your ${reasons.join(' and ')}. Consider an easier session: fewer sets or lighter weights.`,
				restingHr: r,
				hrv: h
			}
		: {
				status: 'good',
				message: `${normal} Train as planned.`,
				restingHr: r,
				hrv: h
			};
}

/** Heart rate and calories from the watch while a workout was open. */
/**
 * Samsung writes a "total calories" record for each watch workout, starting when the workout
 * starts. Matching those to sessions gives the per-workout calories Samsung Health shows; records
 * that don't line up with a real session (e.g. stray entries from other apps) are ignored.
 */
function caloriesBySession(
	sessions: { id: number; time: Date }[],
	totals: { time: Date; value: number }[]
): Map<number, number> {
	const out = new Map<number, number>();
	for (const s of sessions) {
		const match = totals.find(
			(c) => Math.abs(c.time.getTime() - s.time.getTime()) <= 2 * 60 * 1000
		);
		// Samsung rounds each workout down before adding them up.
		if (match) out.set(s.id, Math.floor(match.value));
	}
	return out;
}

export async function workoutVitals(userId: string, start: Date, end: Date) {
	const [hr, totals, sessions] = await Promise.all([
		samples(userId, 'heart_rate', new Date(start.getTime() - 2 * 60 * 60 * 1000), end),
		samples(userId, 'total_calories', new Date(start.getTime() - 2 * 60 * 60 * 1000), end),
		db
			.select({
				id: healthSample.id,
				value: healthSample.value,
				detail: healthSample.detail,
				time: healthSample.startTime,
				end: healthSample.endTime
			})
			.from(healthSample)
			.where(
				and(
					eq(healthSample.userId, userId),
					eq(healthSample.metric, 'exercise'),
					lt(healthSample.startTime, end),
					gte(healthSample.endTime, start),
					notIgnored
				)
			)
			.orderBy(desc(healthSample.value))
			.limit(1)
	]);
	if (!hr.length && !sessions.length) return null;
	const calories = sessions[0]
		? caloriesBySession([{ id: sessions[0].id, time: sessions[0].time }], totals).get(
				sessions[0].id
			)
		: undefined;
	// With a watch session, use its time (the app workout may have been left open); else the whole window.
	const watch = sessions[0];
	const during = watch?.end ? hr.filter((h) => h.time >= watch.time && h.time <= watch.end!) : hr;
	const readings = during.length ? during : hr.filter((h) => h.time >= start);
	const bpm = readings.map((h) => h.value);
	const peaks = readings.map((h) => Number((h.detail as Json | null)?.max ?? h.value));
	return {
		avgHr: bpm.length ? Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length) : null,
		maxHr: peaks.length ? Math.round(Math.max(...peaks)) : null,
		calories: calories ?? null,
		watchMinutes: sessions[0] ? Math.round(sessions[0].value / 60) : null,
		watchType: typeof sessions[0]?.detail?.type === 'string' ? sessions[0].detail.type : null
	};
}

/** Steps, watch sessions and their calories since a date, for the weekly view and Progress. */
export async function activitySince(userId: string, since: Date) {
	const [steps, exercise, totals, distance] = await Promise.all([
		samples(userId, 'steps', since),
		samples(userId, 'exercise', since),
		samples(userId, 'total_calories', since),
		samples(userId, 'distance', since)
	]);
	const calories = caloriesBySession(exercise, totals);
	const counts = undoubleSteps(
		steps.map((s) => ({ time: s.time, end: s.end, value: s.value })),
		distance.map((d) => ({ time: d.time, end: d.end, value: d.value }))
	);
	return {
		steps: counts.map((s) => ({ time: s.time, end: s.end, count: s.value })),
		exercise: exercise.map((e) => {
			const d = (e.detail ?? {}) as Json;
			return {
				id: e.id,
				calories: calories.get(e.id) ?? null,
				time: e.time,
				minutes: Math.round(e.value / 60),
				type: typeof d.type === 'string' ? d.type : null,
				distanceMeters: typeof d.distanceMeters === 'number' ? d.distanceMeters : null
			};
		})
	};
}

/** Body weight readings in lb. */
export async function weightsLb(userId: string) {
	const rows = await samples(userId, 'weight', new Date(0));
	return rows.map((r) => ({ date: r.time, weight: Math.round(r.value * KG_TO_LB * 10) / 10 }));
}

/** Average HRV per day for the last 90 days. */
export async function dailyTrend(userId: string, metric: 'hrv') {
	const rows = await samples(userId, metric, new Date(Date.now() - 90 * DAY_MS));
	const byDay = new Map<string, number[]>();
	for (const r of rows) {
		const key = r.time.toISOString().slice(0, 10);
		byDay.set(key, [...(byDay.get(key) ?? []), r.value]);
	}
	return [...byDay.entries()].map(([day, values]) => ({
		date: new Date(`${day}T12:00:00Z`),
		value: Math.round(values.reduce((a, b) => a + b, 0) / values.length)
	}));
}

/**
 * Resting heart rate per local day since a date: the 10th percentile of awake (7:00–22:00),
 * non-workout readings, on days with at least 20 of them (rules in heart.ts). Worked out by
 * the database, so one number per day comes back instead of thousands of readings.
 */
async function restingDays(userId: string, timeZone: string, since: Date) {
	// Times are stored as UTC without a zone; shift them into the user's zone for days and hours.
	const result = await db.execute<{ day: string; value: number }>(sql`
		select local::date::text as day,
			percentile_cont(${RESTING_PERCENTILE}) within group (order by value) as value
		from (
			select h.value, (h.start_time at time zone 'UTC') at time zone ${timeZone} as local
			from health_sample h
			where h.user_id = ${userId}
				and h.metric = 'heart_rate'
				and h.start_time >= (${since.toISOString()}::timestamptz at time zone 'UTC')
				and not exists (
					select 1 from health_sample e
					where e.user_id = h.user_id
						and e.metric = 'exercise'
						and coalesce(e.detail->>'ignored', '') <> 'true'
						and h.start_time between e.start_time and e.end_time
				)
		) r
		where extract(hour from local) * 60 + extract(minute from local) >= ${AWAKE_START}
			and extract(hour from local) * 60 + extract(minute from local) < ${AWAKE_END}
		group by 1
		having count(*) >= ${MIN_SAMPLES}
		order by 1
	`);
	return result.rows.map((r) => ({
		date: new Date(`${r.day}T12:00:00Z`),
		value: Math.round(Number(r.value))
	}));
}

/** Resting heart rate per local day for the last 90 days, from awake readings. */
export async function restingTrend(userId: string, timeZone: string) {
	const since = new Date(Date.now() - 90 * DAY_MS);
	return restingDays(userId, timeZone, since);
}
