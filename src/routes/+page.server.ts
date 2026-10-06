import { redirect } from '@sveltejs/kit';
import { activitySince, readiness } from '#lib/server/health.ts';
import { createProgram, getDashboard, getProfile, startSession } from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [profile, dashboard, ready, activity] = await Promise.all([
		getProfile(userId),
		getDashboard(userId),
		readiness(userId),
		// Eight days covers the current week in any time zone.
		activitySince(userId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000))
	]);
	if (!profile || !dashboard) redirect(303, '/setup');
	return { profile, ...dashboard, readiness: ready, activity };
};

export const actions: Actions = {
	switchItUp: async ({ locals }) => {
		const userId = locals.user!.id;
		const profile = await getProfile(userId);
		if (!profile) redirect(303, '/setup');
		await createProgram(userId, profile);
		return { switched: true };
	},
	start: async ({ request, locals }) => {
		const workoutId = Number((await request.formData()).get('workoutId'));
		const sessionId = await startSession(locals.user!.id, workoutId);
		if (sessionId) redirect(303, `/sessions/${sessionId}`);
	}
};
