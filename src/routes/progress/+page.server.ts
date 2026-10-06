import { dailyTrend, weightsLb } from '#lib/server/health.ts';
import { getProgress } from '#lib/server/workouts.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [progress, watchWeights, restingHr, hrv] = await Promise.all([
		getProgress(userId),
		weightsLb(userId),
		dailyTrend(userId, 'resting_heart_rate'),
		dailyTrend(userId, 'hrv')
	]);
	// Weights typed in after workouts plus weights from Samsung Health, oldest first.
	const bodyWeight = [
		...progress.bodyWeight.map((b) => ({ ...b, source: 'workout' as const })),
		...watchWeights.map((b) => ({ ...b, source: 'samsung' as const }))
	].sort((a, b) => a.date.getTime() - b.date.getTime());
	return { ...progress, bodyWeight, restingHr, hrv };
};
