import { error, fail, redirect } from '@sveltejs/kit';
import {
	addExercise,
	getWorkout,
	moveExercise,
	removeExercise,
	startSession,
	swapExercise,
	updateTarget
} from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const data = await getWorkout(locals.user!.id, Number(params.id));
	if (!data) error(404, 'Workout not found');
	return data;
};

const whole = (v: FormDataEntryValue | null, min: number, max: number) => {
	const n = Number(v);
	return Number.isInteger(n) && n >= min && n <= max ? n : null;
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
	add: async ({ request, params, locals }) => {
		const exerciseId = (await request.formData()).get('exerciseId')?.toString() ?? '';
		if (!(await addExercise(locals.user!.id, Number(params.id), exerciseId))) {
			return fail(400, { editError: "That exercise couldn't be added." });
		}
		return { added: exerciseId };
	},
	remove: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('workoutExerciseId'));
		if (!(await removeExercise(locals.user!.id, id))) return fail(400, { editError: 'Not found.' });
	},
	move: async ({ request, locals }) => {
		const form = await request.formData();
		const direction = form.get('direction') === 'up' ? -1 : 1;
		await moveExercise(locals.user!.id, Number(form.get('workoutExerciseId')), direction);
	},
	target: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('workoutExerciseId'));
		const sets = whole(form.get('sets'), 1, 10);
		const repLow = whole(form.get('repLow'), 1, 300);
		const repHigh = whole(form.get('repHigh'), 1, 300);
		if (sets === null || repLow === null || repHigh === null) {
			return fail(400, { targetError: id });
		}
		await updateTarget(locals.user!.id, id, sets, repLow, repHigh);
		return { targetSaved: id };
	},
	start: async ({ params, locals }) => {
		const sessionId = await startSession(locals.user!.id, Number(params.id));
		if (!sessionId) error(404, 'Workout not found');
		redirect(303, `/sessions/${sessionId}`);
	}
};
