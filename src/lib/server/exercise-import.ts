import { db } from '#lib/server/db/index.ts';
import { clearPool } from '#lib/server/workouts.ts';
import { sql } from 'drizzle-orm';
import { exercise } from '#lib/server/db/schema.ts';
import type {
	Category,
	Equipment,
	ExerciseDef,
	JointStress,
	Level,
	Pattern
} from '#lib/workout/types.ts';

/** Public-domain exercise dataset: https://github.com/yuhonas/free-exercise-db */
const SOURCE_URL =
	'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
export const IMAGE_BASE =
	'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

interface FreeExercise {
	id: string;
	name: string;
	force: 'push' | 'pull' | 'static' | null;
	level: Level;
	mechanic: 'compound' | 'isolation' | null;
	equipment: string | null;
	primaryMuscles: string[];
	secondaryMuscles: string[];
	instructions: string[];
	category: string;
	images: string[];
}

const EQUIPMENT_MAP: Record<string, Equipment[] | null> = {
	'body only': [],
	dumbbell: ['dumbbell'],
	bands: ['band'],
	barbell: ['barbell'],
	kettlebells: ['kettlebell'],
	cable: ['cable'],
	machine: ['machine'],
	'medicine ball': ['medicine_ball'],
	'exercise ball': ['stability_ball'],
	'foam roll': ['foam_roller'],
	'e-z curl bar': ['ez_bar'],
	other: null
};

function has(name: string, ...words: string[]) {
	return words.some((w) => name.includes(w));
}

function patternFor(ex: FreeExercise, name: string): Pattern | null {
	const m = ex.primaryMuscles;
	if (m.includes('quadriceps'))
		return has(name, 'lunge', 'split', 'step', 'single leg', 'one leg', 'pistol')
			? 'single_leg'
			: 'squat';
	if (m.includes('hamstrings')) return 'hinge';
	if (m.includes('glutes')) return 'glute';
	if (m.includes('chest'))
		return ex.mechanic === 'isolation' || has(name, 'fly', 'flye', 'crossover')
			? 'chest_iso'
			: 'horizontal_push';
	if (m.includes('shoulders')) {
		if (ex.force === 'pull' || has(name, 'rear', 'reverse fly', 'face pull')) return 'rear_delt';
		return ex.mechanic === 'isolation' || has(name, 'raise') ? 'shoulder_iso' : 'vertical_push';
	}
	if (m.includes('lats') || m.includes('middle back')) {
		return has(name, 'pulldown', 'pull-up', 'pullup', 'chin', 'pullover')
			? 'vertical_pull'
			: 'horizontal_pull';
	}
	if (m.includes('triceps')) return 'triceps';
	if (m.includes('biceps') || m.includes('forearms')) return 'biceps';
	if (m.includes('calves')) return 'calves';
	if (m.includes('traps')) return 'shoulder_iso';
	if (m.includes('abdominals') || m.includes('lower back')) return 'core';
	return null;
}

const STRETCH_FOCUS: [string, string][] = [
	['hamstrings', 'hamstrings'],
	['quadriceps', 'quads'],
	['glutes', 'glutes'],
	['abductors', 'hips'],
	['adductors', 'adductors'],
	['calves', 'calves'],
	['chest', 'chest'],
	['shoulders', 'shoulders'],
	['lats', 'lats'],
	['middle back', 'thoracic'],
	['lower back', 'spine'],
	['neck', 'neck']
];

function jointStressFor(ex: FreeExercise, name: string, equipment: Equipment[]): JointStress {
	if (
		has(
			name,
			'jump',
			'plyo',
			'behind the neck',
			'behind-the-neck',
			'snatch',
			'clean',
			'jerk',
			'dip',
			'good morning',
			'upright row'
		)
	)
		return 'high';
	if (ex.level === 'expert') return 'high';
	if (equipment.includes('barbell') && ex.mechanic === 'compound') return 'moderate';
	return 'low';
}

/** Converts one dataset entry, or returns null for entries the generator can't use. */
export function mapExercise(ex: FreeExercise): ExerciseDef | null {
	const keepCategory = ['strength', 'stretching'].includes(ex.category);
	if (!keepCategory) return null;
	const mapped = EQUIPMENT_MAP[ex.equipment ?? 'body only'];
	if (mapped === null || mapped === undefined) return null;

	const name = ex.name.toLowerCase();
	const equipment = [...mapped];
	if (
		has(name, 'bench', 'incline', 'decline', 'chest-supported', 'seated') &&
		!equipment.includes('machine')
	)
		equipment.push('bench');
	if (has(name, 'pull-up', 'pullup', 'chin-up', 'chinup', 'hanging')) equipment.push('pullup_bar');

	let category: Category;
	let pattern: Pattern | null;
	let focus: string | null = null;
	if (ex.category === 'stretching') {
		category = 'mobility';
		pattern = 'stretch';
		focus = STRETCH_FOCUS.find(([muscle]) => ex.primaryMuscles.includes(muscle))?.[1] ?? 'general';
	} else {
		pattern = patternFor(ex, name);
		if (!pattern) return null;
		category = pattern === 'core' ? 'core' : 'strength';
		if (category === 'core')
			focus = ex.primaryMuscles.includes('lower back') ? 'extension' : 'flexion';
	}

	const unilateral = has(
		name,
		'one arm',
		'one-arm',
		'single arm',
		'single-arm',
		'one leg',
		'one-leg',
		'single leg',
		'single-leg',
		'alternating',
		'lunge',
		'split squat',
		'step-up',
		'step up'
	);
	const isHold =
		has(name, 'plank', 'hold', 'hang') ||
		(category === 'mobility' && !has(name, 'circle', 'roll', 'rotation'));

	return {
		id: `fedb-${ex.id}`,
		name: ex.name,
		category,
		pattern,
		focus,
		muscles: [...ex.primaryMuscles, ...ex.secondaryMuscles],
		equipment: [...new Set(equipment)],
		level: ex.level,
		jointStress: jointStressFor(ex, name, equipment),
		unilateral,
		unit: isHold ? 'seconds' : 'reps',
		defaultSets: null,
		repLow: null,
		repHigh: null,
		targetLabel: null,
		cues: [],
		instructions: ex.instructions,
		images: ex.images.map((path) => IMAGE_BASE + path),
		imagesApprox: false,
		source: 'free-exercise-db'
	};
}

/** Downloads the dataset, adds anything new and refreshes photos on exercises already imported. */
export async function importFreeExerciseDb(): Promise<{ added: number; skipped: number }> {
	const res = await fetch(SOURCE_URL);
	if (!res.ok) throw new Error(`Exercise download failed (${res.status})`);
	const data = (await res.json()) as FreeExercise[];

	const rows = data.map(mapExercise).filter((r): r is ExerciseDef => r !== null);
	let added = 0;
	for (let i = 0; i < rows.length; i += 200) {
		const inserted = await db
			.insert(exercise)
			.values(rows.slice(i, i + 200))
			.onConflictDoUpdate({ target: exercise.id, set: { images: sql`excluded.images` } })
			// xmax is 0 only for rows this statement inserted rather than updated.
			.returning({ inserted: sql<boolean>`xmax = 0` });
		added += inserted.filter((r) => r.inserted).length;
	}
	clearPool();
	return { added, skipped: data.length - rows.length };
}
