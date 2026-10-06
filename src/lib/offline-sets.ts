import { deserialize } from '$app/forms';

/**
 * Sets that couldn't reach the server (weak signal) are kept in this browser and sent later.
 * Only the set itself is stored — no account details.
 */
export interface PendingSet {
	sessionId: number;
	workoutExerciseId: number;
	setNumber: number;
	weight: number | null;
	reps: number | null;
}

const KEY = 'workout:pending-sets';

const same = (a: PendingSet, b: PendingSet) =>
	a.sessionId === b.sessionId &&
	a.workoutExerciseId === b.workoutExerciseId &&
	a.setNumber === b.setNumber;

export function readPending(): PendingSet[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function write(list: PendingSet[]) {
	try {
		if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
		else localStorage.removeItem(KEY);
	} catch {
		// Storage blocked: the set stays only in memory for this page.
	}
}

/** Stores (or replaces) a set that didn't save. */
export function addPending(set: PendingSet) {
	write([...readPending().filter((p) => !same(p, set)), set]);
}

/**
 * Tries to send every stored set for a session. Returns how many are still waiting.
 * Sets the server rejects (e.g. removed from the plan) are dropped rather than retried forever.
 */
export async function flushPending(sessionId: number): Promise<number> {
	for (const set of readPending().filter((p) => p.sessionId === sessionId)) {
		const body = new FormData();
		body.set('workoutExerciseId', String(set.workoutExerciseId));
		body.set('setNumber', String(set.setNumber));
		body.set('weight', set.weight == null ? '' : String(set.weight));
		body.set('reps', set.reps == null ? '' : String(set.reps));
		try {
			const res = await fetch(`/sessions/${sessionId}?/log`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			if (res.status >= 500) break; // server trouble: try again later
			// Saved, or rejected for good (e.g. removed from the plan): either way, stop retrying it.
			deserialize(await res.text());
			write(readPending().filter((p) => !same(p, set)));
		} catch {
			break; // still offline
		}
	}
	return readPending().filter((p) => p.sessionId === sessionId).length;
}
