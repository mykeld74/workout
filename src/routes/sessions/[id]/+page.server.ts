import { error, fail, redirect } from '@sveltejs/kit';
import {
	clearSet,
	discardSession,
	finishSession,
	getSession,
	logSet
} from '#lib/server/workouts.ts';
import { readiness, workoutVitals } from '#lib/server/health.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const data = await getSession(userId, Number(params.id));
	if (!data) error(404, 'Session not found');
	const { completedAt, startedAt } = data.session;
	return {
		...data,
		// Before: should today be easier? After: what the watch recorded during the workout.
		readiness: completedAt ? null : await readiness(userId),
		vitals: completedAt ? await workoutVitals(userId, startedAt, completedAt) : null
	};
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
		// Land on the summary.
		redirect(303, `/sessions/${params.id}`);
	},
	discard: async ({ params, locals }) => {
		await discardSession(locals.user!.id, Number(params.id));
		redirect(303, '/');
	}
};
