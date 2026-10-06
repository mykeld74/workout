import { fail } from '@sveltejs/kit';
import { activitySince, dailyTrend, ignoreSession, weightsLb } from '#lib/server/health.ts';
import { finishedSessions, getProgress } from '#lib/server/workouts.ts';
import { dailyTotals, sessionRows, weeklyMinutes } from '#lib/workout/activity.ts';
import { oneWeightPerDay, safeTimeZone } from '#lib/workout/body-weight.ts';
import type { Actions, PageServerLoad } from './$types';

const DAYS = 30;
const WEEKS = 12;

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const userId = locals.user!.id;
	const since = new Date(Date.now() - (WEEKS * 7 + 1) * 24 * 60 * 60 * 1000);
	const [progress, watchWeights, restingHr, hrv, activity, logged] = await Promise.all([
		getProgress(userId),
		weightsLb(userId),
		dailyTrend(userId, 'resting_heart_rate'),
		dailyTrend(userId, 'hrv'),
		activitySince(userId, since),
		finishedSessions(userId, since)
	]);

	// Days are the user's local days (time zone cookie set by the layout).
	const timeZone = safeTimeZone(cookies.get('tz'));

	// Weights typed in after workouts plus weights from Samsung Health: one per day, the one
	// closest to 6:00 AM.
	const bodyWeight = oneWeightPerDay(
		[
			...progress.bodyWeight.map((b) => ({ ...b, source: 'workout' as const })),
			...watchWeights.map((b) => ({ ...b, source: 'samsung' as const }))
		],
		timeZone
	);

	return {
		...progress,
		bodyWeight,
		restingHr,
		hrv,
		timeZone,
		activity: {
			hasData: activity.steps.length + activity.exercise.length > 0,
			steps: dailyTotals(
				activity.steps.map((s) => ({ time: s.time, end: s.end, value: s.count })),
				timeZone,
				DAYS
			),
			// Calories from watch workouts, added up per day: matches Samsung Health's workout calories.
			calories: dailyTotals(
				activity.exercise
					.filter((e) => e.calories !== null)
					.map((e) => ({ time: e.time, value: e.calories! })),
				timeZone,
				DAYS
			),
			weeks: weeklyMinutes(activity.exercise, logged, timeZone, WEEKS),
			sessions: sessionRows(activity.exercise, logged, timeZone)
		}
	};
};

export const actions: Actions = {
	removeSession: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id)) return fail(400);
		await ignoreSession(locals.user!.id, id);
		return { removed: id };
	}
};
