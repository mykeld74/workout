import { fail } from '@sveltejs/kit';
import { importFreeExerciseDb } from '#lib/server/exercise-import.ts';
import {
	exerciseSourceCounts,
	getProfile,
	searchExercises,
	setPref
} from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim() || undefined;
	const pattern = url.searchParams.get('pattern') || undefined;
	const source = url.searchParams.get('source') || undefined;
	const mine = url.searchParams.get('mine') !== '0';
	const show = url.searchParams.get('show') ?? '';

	const profile = await getProfile(locals.user!.id);
	const favorites = [...(profile?.prefs?.favorites ?? [])];
	const hidden = [...(profile?.prefs?.hidden ?? [])];

	const [result, sources] = await Promise.all([
		searchExercises({
			q,
			pattern,
			source,
			equipment: mine && profile ? profile.equipment : undefined,
			// Hidden exercises only appear when asked for.
			ids: show === 'favorites' ? favorites : show === 'hidden' ? hidden : undefined,
			excludeIds: show === '' ? hidden : undefined
		}),
		exerciseSourceCounts()
	]);
	return {
		...result,
		sources,
		favorites,
		hidden,
		filters: { q: q ?? '', pattern: pattern ?? '', source: source ?? '', mine, show }
	};
};

export const actions: Actions = {
	import: async () => {
		try {
			return { imported: await importFreeExerciseDb() };
		} catch (err) {
			return fail(502, { importError: err instanceof Error ? err.message : 'Import failed' });
		}
	},
	pref: async ({ request, locals }) => {
		const form = await request.formData();
		const exerciseId = form.get('exerciseId')?.toString();
		const status = form.get('status')?.toString();
		if (!exerciseId) return fail(400);
		await setPref(
			locals.user!.id,
			exerciseId,
			status === 'favorite' || status === 'hidden' ? status : null
		);
	}
};
