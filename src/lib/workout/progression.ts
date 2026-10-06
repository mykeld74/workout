/** Weight and strength math shared by the workout screen, summaries and the progress page. */

export const DEFAULT_INCREMENT = 5;

/** Rounds to the nearest weight you can actually set, e.g. 27.5 → 25 or 30 with 5 lb steps. */
export function roundToIncrement(weight: number, increment: number): number {
	return Math.round(weight / increment) * increment;
}

/** One step heavier than last time. */
export function nextWeight(last: number, increment: number): number {
	return roundToIncrement(last + increment, increment);
}

/** About 60% of the usual weight, for lighter weeks. Never below one step. */
export function deloadWeight(usual: number, increment: number): number {
	return Math.max(increment, roundToIncrement(usual * 0.6, increment));
}

/**
 * Estimated one-rep max (Epley). Used to compare sets with different weights and reps, e.g.
 * 30 lb × 12 vs 35 lb × 8. Bodyweight or timed sets fall back to reps.
 */
export function estimatedMax(weight: number | null, reps: number | null): number {
	if (!reps) return 0;
	if (!weight) return reps;
	return reps === 1 ? weight : weight * (1 + reps / 30);
}

export interface SetLike {
	weight: number | null;
	reps: number | null;
}

/** The set with the highest estimated max. */
export function bestSet<T extends SetLike>(sets: T[]): T | undefined {
	let best: T | undefined;
	for (const s of sets)
		if (!best || estimatedMax(s.weight, s.reps) > estimatedMax(best.weight, best.reps)) best = s;
	return best;
}

/** Total weight moved: weight × reps summed. Bodyweight and timed sets count as 0. */
export function volume(sets: SetLike[]): number {
	return sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
}
