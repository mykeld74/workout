import {
	createKey,
	deleteHealthData,
	keyStatus,
	metricCounts,
	readiness,
	revokeKey
} from '#lib/server/health.ts';
import { safeTimeZone } from '#lib/workout/body-weight.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const userId = locals.user!.id;
	const [key, counts, ready] = await Promise.all([
		keyStatus(userId),
		metricCounts(userId),
		readiness(userId, safeTimeZone(cookies.get('tz')))
	]);
	return { key, counts, readiness: ready, webhookUrl: `${url.origin}/api/health` };
};

export const actions: Actions = {
	createKey: async ({ locals }) => ({ newKey: await createKey(locals.user!.id) }),
	revokeKey: async ({ locals }) => {
		await revokeKey(locals.user!.id);
		return { revoked: true };
	},
	deleteData: async ({ locals }) => {
		await deleteHealthData(locals.user!.id);
		return { deleted: true };
	}
};
