import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { healthKey, healthSample } from '#lib/server/db/schema.ts';
import { parsePayload } from '#lib/health-payload.ts';

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
					detail: sql`excluded.detail`,
					receivedAt: new Date()
				}
			});
	}
	return rows.length;
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

async function samples(userId: string, metric: Metric, since: Date, until = new Date()) {
	return db
		.select({
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
				lte(healthSample.startTime, until)
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
export async function readiness(userId: string): Promise<Readiness> {
	const now = Date.now();
	const since = new Date(now - 15 * DAY_MS);
	const [rhr, hrv] = await Promise.all([
		samples(userId, 'resting_heart_rate', since),
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

	const r = compare(rhr);
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

	return reasons.length
		? {
				status: 'easy',
				message: `Your ${reasons.join(' and ')}. Consider an easier session: fewer sets or lighter weights.`,
				restingHr: r,
				hrv: h
			}
		: {
				status: 'good',
				message: 'Resting heart rate and HRV look normal. Train as planned.',
				restingHr: r,
				hrv: h
			};
}

/** Heart rate and calories from the watch while a workout was open. */
export async function workoutVitals(userId: string, start: Date, end: Date) {
	const [hr, active, sessions] = await Promise.all([
		samples(userId, 'heart_rate', start, end),
		samples(userId, 'active_calories', new Date(start.getTime() - 5 * 60 * 1000), end),
		db
			.select({
				value: healthSample.value,
				detail: healthSample.detail,
				time: healthSample.startTime
			})
			.from(healthSample)
			.where(
				and(
					eq(healthSample.userId, userId),
					eq(healthSample.metric, 'exercise'),
					lt(healthSample.startTime, end),
					gte(healthSample.endTime, start)
				)
			)
			.orderBy(desc(healthSample.value))
			.limit(1)
	]);
	if (!hr.length && !active.length && !sessions.length) return null;
	const bpm = hr.map((h) => h.value);
	const peaks = hr.map((h) => Number((h.detail as Json | null)?.max ?? h.value));
	return {
		avgHr: bpm.length ? Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length) : null,
		maxHr: peaks.length ? Math.round(Math.max(...peaks)) : null,
		calories: active.length ? Math.round(active.reduce((a, c) => a + c.value, 0)) : null,
		watchMinutes: sessions[0] ? Math.round(sessions[0].value / 60) : null
	};
}

/** Raw steps and exercise sessions since a date, for the weekly view (grouped by day in the browser). */
export async function activitySince(userId: string, since: Date) {
	const [steps, exercise] = await Promise.all([
		samples(userId, 'steps', since),
		samples(userId, 'exercise', since)
	]);
	return {
		steps: steps.map((s) => ({ time: s.time, count: s.value })),
		exercise: exercise.map((e) => {
			const d = (e.detail ?? {}) as Json;
			return {
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

/** One value per day (the lowest resting HR, the average HRV) for the last 90 days. */
export async function dailyTrend(userId: string, metric: 'resting_heart_rate' | 'hrv') {
	const rows = await samples(userId, metric, new Date(Date.now() - 90 * DAY_MS));
	const byDay = new Map<string, number[]>();
	for (const r of rows) {
		const key = r.time.toISOString().slice(0, 10);
		byDay.set(key, [...(byDay.get(key) ?? []), r.value]);
	}
	return [...byDay.entries()].map(([day, values]) => ({
		date: new Date(`${day}T12:00:00Z`),
		value:
			metric === 'resting_heart_rate'
				? Math.min(...values)
				: Math.round(values.reduce((a, b) => a + b, 0) / values.length)
	}));
}
