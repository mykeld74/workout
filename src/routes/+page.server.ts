import { redirect } from '@sveltejs/kit';
import { createProgram, getDashboard, getProfile, startSession } from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [profile, dashboard] = await Promise.all([getProfile(userId), getDashboard(userId)]);
	if (!profile || !dashboard) redirect(303, '/setup');
	return { profile, ...dashboard };
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
