import { SHEET_LAYOUT } from './catalog.ts';
import type {
	Equipment,
	ExerciseDef,
	Guidelines,
	Pattern,
	PlannedExercise,
	PlannedProgram,
	PlannedWorkout,
	Profile,
	Role,
	WorkoutKind
} from './types.ts';

type Slot = [Pattern, Role];

const STRENGTH_TEMPLATES: Record<string, Slot[]> = {
	'push-A': [
		['squat', 'primary'],
		['horizontal_push', 'primary'],
		['single_leg', 'secondary'],
		['vertical_push', 'secondary'],
		['chest_iso', 'accessory'],
		['triceps', 'accessory'],
		['shoulder_iso', 'accessory'],
		['triceps', 'accessory']
	],
	'pull-A': [
		['hinge', 'primary'],
		['horizontal_pull', 'primary'],
		['glute', 'secondary'],
		['vertical_pull', 'secondary'],
		['biceps', 'accessory'],
		['rear_delt', 'accessory'],
		['biceps', 'accessory']
	],
	'push-B': [
		['single_leg', 'primary'],
		['horizontal_push', 'primary'],
		['squat', 'secondary'],
		['horizontal_push', 'accessory'],
		['triceps', 'accessory'],
		['shoulder_iso', 'accessory'],
		['triceps', 'accessory'],
		['calves', 'accessory']
	],
	'pull-B': [
		['hinge', 'primary'],
		['horizontal_pull', 'primary'],
		['glute', 'secondary'],
		['vertical_pull', 'accessory'],
		['biceps', 'accessory'],
		['rear_delt', 'accessory'],
		['biceps', 'accessory']
	]
};

/** Where to look when a slot has nothing that fits the user's equipment. */
const FALLBACK: Partial<Record<Pattern, Pattern[]>> = {
	squat: ['single_leg'],
	single_leg: ['squat'],
	hinge: ['glute'],
	glute: ['hinge'],
	chest_iso: ['horizontal_push'],
	vertical_push: ['shoulder_iso', 'horizontal_push'],
	shoulder_iso: ['vertical_push'],
	vertical_pull: ['horizontal_pull'],
	rear_delt: ['horizontal_pull'],
	calves: ['glute', 'core']
};

const DAY_INFO: Record<WorkoutKind, string> = {
	push: 'Chest · Shoulders · Triceps + Quads',
	pull: 'Back · Rear delts · Biceps + Hamstrings/Glutes',
	mobility: 'Stretch + core · 12–14 min'
};

const ROLE_DEFAULTS: Record<Role, { sets: number; reps: [number, number]; rest: string }> = {
	primary: { sets: 3, reps: [8, 12], rest: '90–120s' },
	secondary: { sets: 3, reps: [8, 12], rest: '60–90s' },
	accessory: { sets: 2, reps: [10, 15], rest: '60s' },
	stretch: { sets: 1, reps: [30, 45], rest: '—' },
	core: { sets: 2, reps: [8, 12], rest: '20–30s' }
};

const LOWER_BODY: Pattern[] = ['squat', 'single_leg', 'hinge', 'glute', 'calves'];
const LOADABLE: Equipment[] = ['dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'ez_bar'];

export function isAvailable(ex: ExerciseDef, equipment: readonly Equipment[]): boolean {
	return ex.equipment.every((e) => equipment.includes(e));
}

/** Holding one dumbbell by its end with both hands: not possible with PowerBlock-style handles. */
const DUMBBELL_END_IDS = new Set(['overhead-db-triceps', 'db-pullover']);

export function needsDumbbellEnd(ex: ExerciseDef): boolean {
	if (DUMBBELL_END_IDS.has(ex.id)) return true;
	return ex.equipment.includes('dumbbell') && /pullover|both hands|two.hand/i.test(ex.name);
}

export function deloadEveryFor(age: number): number {
	return age < 40 ? 7 : age < 55 ? 6 : 5;
}

export function isDeloadWeek(week: number, every: number): boolean {
	return week > 1 && week % every === 0;
}

export function isAppropriate(ex: ExerciseDef, profile: Profile): boolean {
	if (profile.prefs?.hidden.has(ex.id)) return false;
	if (profile.powerblock && needsDumbbellEnd(ex)) return false;
	if (ex.jointStress === 'high' && (profile.age >= 55 || profile.experience === 'new'))
		return false;
	if (ex.level === 'expert' && (profile.age >= 65 || profile.experience !== 'experienced'))
		return false;
	if (ex.level === 'intermediate' && profile.age >= 55 && profile.experience === 'new')
		return false;
	return true;
}

export function ageBand(age: number): string {
	if (age < 40) return 'Under 40';
	if (age < 55) return '40–54';
	if (age < 65) return '55–64';
	return '65+';
}

export function guidelinesFor(profile: Profile): Guidelines {
	const { age, equipment, experience } = profile;
	const has = (e: Equipment) => equipment.includes(e);

	const warmupLength = age < 40 ? '5–8 min' : age < 55 ? '8–10 min' : '10–12 min';
	const warmupParts = [
		has('cardio') ? '5 min easy cardio' : '5 min brisk walk or marching in place',
		has('band') ? 'band pull-aparts' : 'wall slides',
		'bodyweight squats',
		'hip hinges',
		'arm circles'
	];
	if (age >= 55) warmupParts.push('30s single-leg balance / side');
	warmupParts.push('1 light set of exercise #1');

	const effort =
		age < 40
			? 'Stop each set with 1–2 reps left.'
			: age < 65
				? 'Stop each set with 1–3 reps left.'
				: 'Stop each set with 2–3 reps left. Smooth reps beat heavy ones.';

	const deloadEvery = deloadEveryFor(age);

	const progress = has('dumbbell')
		? 'Hit the top of the range on every set → next dumbbell up. Or slow the lowering, pause, add a band.'
		: 'Hit the top of the range on every set → add reps, slow the lowering, or pause at the hardest point.';

	const notes: string[] = [];
	if (age >= 40)
		notes.push(
			'Recovery takes longer: keep at least one rest day between hard sessions for the same muscles.'
		);
	if (age >= 55)
		notes.push(
			'Use support (wall, bench) for single-leg work and skip anything that pinches a joint.'
		);
	if (age >= 65) notes.push('High-impact and very technical lifts are left out of your plans.');
	if (experience === 'new') notes.push('Learn each move with light weight before chasing numbers.');

	return {
		ageBand: ageBand(age),
		deloadEvery,
		warmup: `Warm-up (${warmupLength}): ${warmupParts.join(' · ')}`,
		effort,
		deload: `Every ${deloadEvery}th week is lighter: 2 sets per lift at about 60% of your usual weight.`,
		progress,
		notes
	};
}

function perSideLabel(ex: Pick<ExerciseDef, 'pattern'>): string {
	return LOWER_BODY.includes(ex.pattern) ? ' / leg' : ' / side';
}

function range(lo: number, hi: number, suffix: string): string {
	return lo === hi ? `${lo}${suffix}` : `${lo}–${hi}${suffix}`;
}

/** "3 × 8–12 / leg", "30–45s / side", "2 × 10". */
export function targetText(
	ex: Pick<ExerciseDef, 'unit' | 'unilateral' | 'pattern'>,
	sets: number,
	lo: number,
	hi: number
): string {
	const reps =
		range(lo, hi, ex.unit === 'seconds' ? 's' : '') + (ex.unilateral ? perSideLabel(ex) : '');
	return sets === 1 ? reps : `${sets} × ${reps}`;
}

/** Role for an exercise added by hand: lifts are accessories, mobility days keep their kind. */
export function roleFor(ex: ExerciseDef): Role {
	return ex.category === 'mobility' ? 'stretch' : ex.category === 'core' ? 'core' : 'accessory';
}

export function prescribe(ex: ExerciseDef, role: Role, profile: Profile): PlannedExercise {
	const base = ROLE_DEFAULTS[role];
	const isStrength = ex.category === 'strength';
	const sets = isStrength ? base.sets : (ex.defaultSets ?? base.sets);
	let lo = ex.repLow ?? base.reps[0];
	let hi = ex.repHigh ?? base.reps[1];

	if (isStrength && ex.unit === 'reps' && !ex.targetLabel) {
		if (profile.age >= 65) {
			lo = Math.max(lo, 10);
			hi = Math.max(hi, 15);
		} else if (profile.age >= 55) {
			lo = Math.max(lo, 8);
			hi = Math.max(hi, lo + 4);
		}
	}

	const target = ex.targetLabel
		? ex.targetLabel.includes('×') || sets === 1
			? ex.targetLabel
			: `${sets} × ${ex.targetLabel}`
		: targetText(ex, sets, lo, hi);

	return {
		exerciseId: ex.id,
		role,
		sets,
		repLow: lo,
		repHigh: hi,
		unit: ex.unit,
		perSide: ex.unilateral,
		rest: base.rest,
		target
	};
}

/**
 * When a slot can't be filled, two exercises for the same muscle (e.g. both curls) can end up
 * next to each other. Moves the second one later, past a different exercise; failing that (they're
 * at the end), moves the first one earlier.
 */
function separateRepeats(exercises: PlannedExercise[], patterns: Pattern[]) {
	const move = (from: number, to: number) => {
		exercises.splice(to, 0, ...exercises.splice(from, 1));
		patterns.splice(to, 0, ...patterns.splice(from, 1));
	};
	for (let i = 1; i < exercises.length; i++) {
		const p = patterns[i];
		if (p !== patterns[i - 1]) continue;
		const later = patterns.findIndex((q, k) => k > i && q !== p && patterns[k + 1] !== p);
		if (later !== -1) {
			move(i, later);
			continue;
		}
		for (let k = i - 2; k >= 0; k--) {
			if (patterns[k] !== p && (k === 0 || patterns[k - 1] !== p)) {
				move(i - 1, k);
				break;
			}
		}
	}
}

interface GenerateOptions {
	profile: Profile;
	pool: ExerciseDef[];
	/** Exercises in the plan being replaced; avoided where alternatives exist. */
	previousIds?: Iterable<string>;
	/** Follow the original sheets slot-for-slot where possible (first plan). */
	useSheets?: boolean;
	random?: () => number;
}

export function generateProgram(opts: GenerateOptions): PlannedProgram {
	const { profile, useSheets = false, random = Math.random } = opts;
	const previous = new Set(opts.previousIds ?? []);
	const usable = opts.pool.filter(
		(ex) => isAvailable(ex, profile.equipment) && isAppropriate(ex, profile)
	);
	const byId = new Map(usable.map((ex) => [ex.id, ex]));
	const used = new Set<string>();
	const guidelines = guidelinesFor(profile);

	function score(ex: ExerciseDef, role: Role): number {
		let s = random();
		if (previous.has(ex.id)) s -= 2;
		if (ex.source !== 'free-exercise-db') s += 0.3;
		if (profile.prefs?.favorites.has(ex.id)) s += 0.8;
		if (role === 'primary' && ex.equipment.some((e) => LOADABLE.includes(e))) s += 0.6;
		return s;
	}

	/** Prefers exercises not yet used elsewhere in the plan; `exclude` is never picked. */
	function choose(
		candidates: ExerciseDef[],
		role: Role,
		exclude: Set<string>
	): ExerciseDef | undefined {
		const allowed = candidates.filter((ex) => !exclude.has(ex.id));
		const fresh = allowed.filter((ex) => !used.has(ex.id));
		const list = fresh.length ? fresh : allowed;
		let best: ExerciseDef | undefined;
		let bestScore = -Infinity;
		for (const ex of list) {
			const s = score(ex, role);
			if (s > bestScore) {
				best = ex;
				bestScore = s;
			}
		}
		return best;
	}

	function pickForSlot(
		pattern: Pattern,
		role: Role,
		inWorkout: Set<string>,
		preferred?: string
	): ExerciseDef | undefined {
		if (preferred && byId.has(preferred) && !used.has(preferred)) return byId.get(preferred);
		for (const p of [pattern, ...(FALLBACK[pattern] ?? [])]) {
			const candidates = usable.filter((ex) => ex.pattern === p && ex.category === 'strength');
			const ex = choose(candidates, role, inWorkout);
			if (ex) return ex;
		}
		return undefined;
	}

	const workouts: PlannedWorkout[] = [];

	for (const [key, slots] of Object.entries(STRENGTH_TEMPLATES)) {
		const [kind, variant] = key.split('-') as [WorkoutKind, string];
		const sheet = useSheets ? SHEET_LAYOUT[key] : undefined;
		const exercises: PlannedExercise[] = [];
		const inWorkout = new Set<string>();
		const patterns: Pattern[] = [];
		slots.forEach(([pattern, role], i) => {
			const ex = pickForSlot(pattern, role, inWorkout, sheet?.[i]);
			if (!ex) return;
			inWorkout.add(ex.id);
			used.add(ex.id);
			exercises.push(prescribe(ex, role, profile));
			patterns.push(ex.pattern);
		});
		separateRepeats(exercises, patterns);
		workouts.push({
			kind,
			variant,
			title: `${kind === 'push' ? 'Push' : 'Pull'} ${variant}`,
			focus: DAY_INFO[kind],
			warmup: guidelines.warmup,
			exercises
		});
	}

	const stretches = usable.filter((ex) => ex.category === 'mobility');
	const cores = usable.filter((ex) => ex.category === 'core');

	/** Picks `count` exercises, cycling through focus areas so a day isn't all hips. */
	function spread(candidates: ExerciseDef[], count: number, role: Role): ExerciseDef[] {
		const picked: ExerciseDef[] = [];
		const groups = new Map<string, ExerciseDef[]>();
		for (const ex of candidates) {
			const key = ex.focus ?? ex.pattern;
			groups.set(key, [...(groups.get(key) ?? []), ex]);
		}
		const keys = [...groups.keys()].sort(() => random() - 0.5);
		while (picked.length < count) {
			const before = picked.length;
			for (const key of keys) {
				if (picked.length >= count) break;
				const ex = choose(groups.get(key)!, role, new Set(picked.map((p) => p.id)));
				if (ex) picked.push(ex);
			}
			if (picked.length === before) break;
		}
		return picked;
	}

	for (const variant of ['A', 'B', 'C']) {
		const sheet = useSheets ? SHEET_LAYOUT[`mobility-${variant}`] : undefined;
		let day: ExerciseDef[];
		const fromSheet = sheet?.map((id) => byId.get(id)).filter((ex): ex is ExerciseDef => !!ex);
		if (fromSheet && fromSheet.length === sheet!.length) {
			day = fromSheet;
		} else {
			day = [...spread(stretches, 7, 'stretch'), ...spread(cores, 4, 'core')];
		}
		day.forEach((ex) => used.add(ex.id));
		workouts.push({
			kind: 'mobility',
			variant,
			title: `Mobility + core ${variant}`,
			focus: DAY_INFO.mobility,
			warmup:
				'Rotate A → B → C, one a day, away from lifting time. Stretch to mild tension, never pain. After a hard lift, stretches only is fine.',
			exercises: day.map((ex) =>
				prescribe(ex, ex.category === 'core' ? 'core' : 'stretch', profile)
			)
		});
	}

	return { guidelines, workouts };
}

/**
 * Exercises that could take this slot, for the swap menu: same movement first (curated before
 * imported), then the fallback movements.
 */
export function replacementOptions(
	pool: ExerciseDef[],
	current: ExerciseDef,
	inWorkout: Iterable<string>,
	profile: Profile
): ExerciseDef[] {
	const taken = new Set(inWorkout);
	const fits = (ex: ExerciseDef) =>
		!taken.has(ex.id) &&
		ex.category === current.category &&
		isAvailable(ex, profile.equipment) &&
		isAppropriate(ex, profile);
	const fav = (ex: ExerciseDef) => Number(!profile.prefs?.favorites.has(ex.id));
	const curatedFirst = (a: ExerciseDef, b: ExerciseDef) =>
		fav(a) - fav(b) ||
		Number(a.source === 'free-exercise-db') - Number(b.source === 'free-exercise-db') ||
		a.name.localeCompare(b.name);
	return [current.pattern, ...(FALLBACK[current.pattern] ?? [])].flatMap((p) =>
		pool.filter((ex) => ex.pattern === p && fits(ex)).sort(curatedFirst)
	);
}

/** A random different exercise for the same slot, for "Surprise me". */
export function pickReplacement(
	pool: ExerciseDef[],
	current: ExerciseDef,
	inWorkout: Iterable<string>,
	profile: Profile,
	random: () => number = Math.random
): ExerciseDef | undefined {
	const options = replacementOptions(pool, current, inWorkout, profile);
	const sameMove = options.filter((ex) => ex.pattern === current.pattern);
	const list = sameMove.length ? sameMove : options;
	return list[Math.floor(random() * list.length)];
}
