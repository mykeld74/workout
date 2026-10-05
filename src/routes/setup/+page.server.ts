import { fail, redirect } from '@sveltejs/kit';
import { createProgram, getDashboard, getProfile, saveProfile } from '#lib/server/workouts.ts';
import {
	ageFromBirthDate,
	DEFAULT_EQUIPMENT,
	EQUIPMENT,
	type Equipment,
	type Experience
} from '#lib/workout/types.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [profile, dashboard] = await Promise.all([getProfile(userId), getDashboard(userId)]);
	return {
		profile: profile ?? {
			birthDate: '',
			equipment: DEFAULT_EQUIPMENT,
			experience: 'returning' as Experience
		},
		isNew: !profile,
		hasProgram: !!dashboard
	};
};

const EXPERIENCE: Experience[] = ['new', 'returning', 'experienced'];

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const form = await request.formData();
		const birthDate = form.get('birthDate')?.toString() ?? '';
		const experience = form.get('experience') as Experience;
		const equipment = form
			.getAll('equipment')
			.map(String)
			.filter((e): e is Equipment => e in EQUIPMENT);
		const regenerate = form.get('regenerate') === 'on';

		const validDate =
			/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && !Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`));
		const age = validDate ? ageFromBirthDate(birthDate) : NaN;
		if (!(age >= 13 && age <= 100)) {
			return fail(400, { message: 'Enter a valid birthday (you need to be 13–100).' });
		}
		if (!EXPERIENCE.includes(experience)) {
			return fail(400, { message: 'Pick your training experience.' });
		}

		await saveProfile(userId, { birthDate, experience, equipment });

		const existing = await getDashboard(userId);
		if (!existing || regenerate) await createProgram(userId, { age, experience, equipment });
		redirect(303, '/');
	}
};
