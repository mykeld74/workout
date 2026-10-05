import { error, fail, redirect } from '@sveltejs/kit';
import {
	clearSet,
	discardSession,
	finishSession,
	getSession,
	logSet
} from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const data = await getSession(locals.user!.id, Number(params.id));
	if (!data) error(404, 'Session not found');
	return data;
};

function optionalNumber(value: FormDataEntryValue | null): number | null | undefined {
	if (value === null || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const actions: Actions = {
	log: async ({ request, params, locals }) => {
		const form = await request.formData();
		const workoutExerciseId = Number(form.get('workoutExerciseId'));
		const setNumber = Number(form.get('setNumber'));
		const weight = optionalNumber(form.get('weight'));
		const reps = optionalNumber(form.get('reps'));
		if (weight === undefined || reps === undefined || !Number.isInteger(setNumber)) {
			return fail(400, { message: 'Enter numbers only.' });
		}
		const ok = await logSet(
			locals.user!.id,
			Number(params.id),
			workoutExerciseId,
			setNumber,
			weight,
			reps === null ? null : Math.round(reps)
		);
		if (!ok) return fail(404, { message: 'Exercise not found in this session.' });
		return { logged: { workoutExerciseId, setNumber } };
	},
	clear: async ({ request, params, locals }) => {
		const form = await request.formData();
		await clearSet(
			locals.user!.id,
			Number(params.id),
			Number(form.get('workoutExerciseId')),
			Number(form.get('setNumber'))
		);
	},
	finish: async ({ request, params, locals }) => {
		const form = await request.formData();
		const bodyWeight = optionalNumber(form.get('bodyWeight')) ?? null;
		const notes = form.get('notes')?.toString().trim() || null;
		await finishSession(locals.user!.id, Number(params.id), bodyWeight, notes);
		redirect(303, '/');
	},
	discard: async ({ params, locals }) => {
		await discardSession(locals.user!.id, Number(params.id));
		redirect(303, '/');
	}
};
