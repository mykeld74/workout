import { error, fail, redirect } from '@sveltejs/kit';
import { getWorkout, startSession, swapExercise } from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const data = await getWorkout(locals.user!.id, Number(params.id));
	if (!data) error(404, 'Workout not found');
	return data;
};

export const actions: Actions = {
	swap: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('workoutExerciseId'));
		const target = form.get('exerciseId')?.toString() || undefined;
		const swapped = await swapExercise(locals.user!.id, id, target);
		if (!swapped) return fail(400, { swapFailed: id });
		return { swapped: id };
	},
	start: async ({ params, locals }) => {
		const sessionId = await startSession(locals.user!.id, Number(params.id));
		if (!sessionId) error(404, 'Workout not found');
		redirect(303, `/sessions/${sessionId}`);
	}
};
