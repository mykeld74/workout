export const EQUIPMENT = {
	dumbbell: 'Dumbbells',
	bench: 'Adjustable bench',
	band: 'Resistance bands',
	pullup_bar: 'Pull-up bar',
	kettlebell: 'Kettlebell',
	barbell: 'Barbell + rack',
	ez_bar: 'EZ curl bar',
	cable: 'Cable station',
	machine: 'Weight machines',
	medicine_ball: 'Medicine ball',
	stability_ball: 'Stability ball',
	foam_roller: 'Foam roller',
	cardio: 'Cardio machine'
} as const;

export type Equipment = keyof typeof EQUIPMENT;

/** What the original workout sheets were built around. */
export const DEFAULT_EQUIPMENT: Equipment[] = ['dumbbell', 'bench', 'band', 'cardio'];

export type Category = 'strength' | 'mobility' | 'core';

export const PATTERNS = {
	squat: 'Squat',
	single_leg: 'Single-leg',
	hinge: 'Hinge',
	glute: 'Glutes',
	horizontal_push: 'Horizontal push',
	vertical_push: 'Vertical push',
	chest_iso: 'Chest isolation',
	shoulder_iso: 'Shoulder isolation',
	horizontal_pull: 'Row',
	vertical_pull: 'Vertical pull',
	rear_delt: 'Rear delts',
	triceps: 'Triceps',
	biceps: 'Biceps',
	calves: 'Calves',
	core: 'Core',
	stretch: 'Stretch'
} as const;

export type Pattern = keyof typeof PATTERNS;
export type Level = 'beginner' | 'intermediate' | 'expert';
export type JointStress = 'low' | 'moderate' | 'high';
export type Unit = 'reps' | 'seconds';
export type Experience = 'new' | 'returning' | 'experienced';

export interface ExerciseDef {
	id: string;
	name: string;
	category: Category;
	pattern: Pattern;
	/** Stretch region or core sub-type; used to spread mobility days across the body. */
	focus: string | null;
	muscles: string[];
	/** Everything required. Bodyweight exercises have an empty list. */
	equipment: Equipment[];
	level: Level;
	jointStress: JointStress;
	unilateral: boolean;
	unit: Unit;
	defaultSets: number | null;
	repLow: number | null;
	repHigh: number | null;
	/** Overrides the computed "3 × 8–12" target, e.g. "max − 2". */
	targetLabel: string | null;
	cues: string[];
	instructions: string[];
	/** Start and finish photos. */
	images: string[];
	/** The photos show a close variation (e.g. cable instead of band), not this exact exercise. */
	imagesApprox: boolean;
	source: 'sheet' | 'starter' | 'free-exercise-db';
}

export type WorkoutKind = 'push' | 'pull' | 'mobility';
export type Role = 'primary' | 'secondary' | 'accessory' | 'stretch' | 'core';

export interface Profile {
	age: number;
	equipment: Equipment[];
	experience: Experience;
	/** Adjustable dumbbells with caged handles: no holding one dumbbell by its end. */
	powerblock?: boolean;
	/** Smallest weight jump available, in lb. */
	weightIncrement?: number;
	/** Exercises the user starred or hid. */
	prefs?: ExercisePrefs;
}

export interface ExercisePrefs {
	favorites: Set<string>;
	hidden: Set<string>;
}

/** What's stored: birth date as YYYY-MM-DD, so age stays current. */
export interface StoredProfile extends Profile {
	birthDate: string;
}

/** Whole years between `birthDate` (YYYY-MM-DD) and `today`. */
export function ageFromBirthDate(birthDate: string, today = new Date()): number {
	const [y, m, d] = birthDate.split('-').map(Number);
	let age = today.getFullYear() - y;
	const month = today.getMonth() + 1;
	if (month < m || (month === m && today.getDate() < d)) age--;
	return age;
}

export interface Guidelines {
	ageBand: string;
	/** Every Nth week is a lighter week. Missing on plans made before this existed. */
	deloadEvery?: number;
	warmup: string;
	effort: string;
	deload: string;
	progress: string;
	notes: string[];
}

export interface PlannedExercise {
	exerciseId: string;
	role: Role;
	sets: number;
	repLow: number | null;
	repHigh: number | null;
	unit: Unit;
	perSide: boolean;
	rest: string;
	target: string;
}

export interface PlannedWorkout {
	kind: WorkoutKind;
	variant: string;
	title: string;
	focus: string;
	warmup: string;
	exercises: PlannedExercise[];
}

export interface PlannedProgram {
	guidelines: Guidelines;
	workouts: PlannedWorkout[];
}
