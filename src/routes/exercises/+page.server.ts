import { fail } from '@sveltejs/kit';
import { importFreeExerciseDb } from '#lib/server/exercise-import.ts';
import { exerciseSourceCounts, getProfile, searchExercises } from '#lib/server/workouts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim() || undefined;
	const pattern = url.searchParams.get('pattern') || undefined;
	const source = url.searchParams.get('source') || undefined;
	const mine = url.searchParams.get('mine') !== '0';

	const profile = await getProfile(locals.user!.id);
	const [result, sources] = await Promise.all([
		searchExercises({
			q,
			pattern,
			source,
			equipment: mine && profile ? profile.equipment : undefined
		}),
		exerciseSourceCounts()
	]);
	return {
		...result,
		sources,
		filters: { q: q ?? '', pattern: pattern ?? '', source: source ?? '', mine }
	};
};

export const actions: Actions = {
	import: async () => {
		try {
			return { imported: await importFreeExerciseDb() };
		} catch (err) {
			return fail(502, { importError: err instanceof Error ? err.message : 'Import failed' });
		}
	}
};
