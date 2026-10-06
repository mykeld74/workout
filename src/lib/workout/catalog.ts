import type { Category, Equipment, ExerciseDef, JointStress, Pattern, Unit } from './types.ts';

interface Spec {
	id: string;
	name: string;
	pattern: Pattern;
	equipment?: Equipment[];
	muscles?: string[];
	focus?: string;
	cues: string[];
	sets?: number;
	reps?: [number, number];
	unit?: Unit;
	target?: string;
	unilateral?: boolean;
	stress?: JointStress;
	level?: ExerciseDef['level'];
	source?: ExerciseDef['source'];
}

function def(category: Category, s: Spec): ExerciseDef {
	return {
		id: s.id,
		name: s.name,
		category,
		pattern: s.pattern,
		focus: s.focus ?? null,
		muscles: s.muscles ?? [],
		equipment: s.equipment ?? [],
		level: s.level ?? 'beginner',
		jointStress: s.stress ?? 'low',
		unilateral: s.unilateral ?? false,
		unit: s.unit ?? 'reps',
		defaultSets: s.sets ?? null,
		repLow: s.reps?.[0] ?? null,
		repHigh: s.reps?.[1] ?? null,
		targetLabel: s.target ?? null,
		cues: s.cues,
		instructions: [],
		images: [],
		imagesApprox: false,
		source: s.source ?? 'sheet'
	};
}

const strength = (s: Spec) => def('strength', s);
const stretch = (s: Spec) => def('mobility', s);
const core = (s: Spec) => def('core', s);

const PHOTO_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/**
 * Start/finish photos from Free Exercise DB (public domain). `true` marks a close variation
 * rather than the exact exercise. Exercises not listed have no matching photos.
 */
const PHOTOS: Record<string, [folder: string, approx?: boolean]> = {
	'goblet-squat': ['Goblet_Squat'],
	'db-bench-press': ['Dumbbell_Bench_Press'],
	'bulgarian-split-squat': ['Split_Squat_with_Dumbbells', true],
	'seated-db-press': ['Seated_Dumbbell_Press'],
	'db-fly': ['Dumbbell_Flyes'],
	'db-lateral-raise': ['Side_Lateral_Raise'],
	'overhead-db-triceps': ['Standing_Dumbbell_Triceps_Extension'],
	'one-arm-overhead-triceps': ['Dumbbell_One-Arm_Triceps_Extension'],
	'overhead-triceps-iso-hold': ['Dumbbell_One-Arm_Triceps_Extension', true],
	'reverse-lunge': ['Dumbbell_Rear_Lunge'],
	'incline-db-press': ['Incline_Dumbbell_Press'],
	'heel-elevated-goblet-squat': ['Goblet_Squat', true],
	'push-up': ['Pushups'],
	'db-upright-row': ['Standing_Dumbbell_Upright_Row'],
	'db-skull-crusher': ['Lying_Dumbbell_Tricep_Extension'],
	'standing-calf-raise': ['Standing_Calf_Raises'],
	'db-rdl': ['Stiff-Legged_Dumbbell_Deadlift', true],
	'one-arm-db-row': ['One-Arm_Dumbbell_Row'],
	'db-hip-thrust': ['Barbell_Hip_Thrust', true],
	'band-lat-pulldown': ['Close-Grip_Front_Lat_Pulldown', true],
	'band-face-pull': ['Face_Pull', true],
	'incline-db-curl': ['Incline_Dumbbell_Curl'],
	'db-curl': ['Dumbbell_Bicep_Curl'],
	'single-leg-db-rdl': ['Kettlebell_One-Legged_Deadlift', true],
	'chest-supported-db-row': ['Dumbbell_Incline_Row'],
	'feet-up-single-leg-bridge': ['Single_Leg_Glute_Bridge', true],
	'db-pullover': ['Bent-Arm_Dumbbell_Pullover'],
	'db-rear-delt-fly': ['Seated_Bent-Over_Rear_Delt_Raise', true],
	'hammer-curl': ['Hammer_Curls'],
	'db-spider-curl': ['Spider_Curl', true],
	'bodyweight-squat': ['Bodyweight_Squat'],
	'split-squat': ['Split_Squats'],
	'glute-bridge': ['Butt_Lift_Bridge'],
	'db-floor-press': ['Dumbbell_Floor_Press'],
	'standing-db-press': ['Standing_Dumbbell_Press'],
	'db-bent-over-row': ['Bent_Over_Two-Dumbbell_Row'],
	'band-row': ['Seated_Cable_Rows', true],
	'pull-up': ['Pullups'],
	'band-pull-apart': ['Band_Pull_Apart'],
	'bench-dip': ['Bench_Dips'],
	'band-curl': ['Dumbbell_Bicep_Curl', true],
	'kb-overhead-triceps': ['Standing_Dumbbell_Triceps_Extension', true],
	'diamond-push-up': ['Push-Ups_-_Close_Triceps_Position'],
	'band-pushdown': ['Triceps_Pushdown', true],
	'band-hammer-curl': ['Hammer_Curls', true],
	'kb-curl': ['Dumbbell_Bicep_Curl', true],
	'kb-hammer-curl': ['Hammer_Curls', true],
	'flexed-arm-hang': ['Chin-Up', true],
	'kb-swing': ['One-Arm_Kettlebell_Swings', true],
	'cat-cow': ['Cat_Stretch'],
	'worlds-greatest-stretch': ['Worlds_Greatest_Stretch'],
	'half-kneeling-hip-flexor': ['Kneeling_Hip_Flexor'],
	'band-hamstring-stretch': ['Hamstring_Stretch'],
	'childs-pose-reach': ['Childs_Pose'],
	'mcgill-curl-up': ['Crunches', true],
	'front-plank': ['Plank'],
	'band-pallof-press': ['Pallof_Press', true],
	'deep-squat-hold': ['Bodyweight_Squat', true],
	'couch-stretch': ['Standing_Elevated_Quad_Stretch', true],
	'band-pass-through': ['Chest_And_Front_Of_Shoulder_Stretch', true],
	'seated-forward-fold': ['Seated_Floor_Hamstring_Stretch', true],
	'glute-bridge-march': ['Butt_Lift_Bridge', true],
	'reverse-crunch': ['Reverse_Crunch'],
	'low-lunge-reach': ['Kneeling_Hip_Flexor', true],
	'wall-calf-stretch': ['Calf_Stretch_Hands_Against_Wall'],
	'side-plank-knees': ['Side_Bridge', true],
	'prone-y-raise': ['Superman', true],
	'plank-shoulder-taps': ['Plank', true],
	'band-woodchop': ['Standing_Cable_Wood_Chop', true]
};

function withPhotos(ex: ExerciseDef): ExerciseDef {
	const photo = PHOTOS[ex.id];
	if (!photo) return ex;
	const [folder, approx = false] = photo;
	return {
		...ex,
		images: [`${PHOTO_BASE}${folder}/0.jpg`, `${PHOTO_BASE}${folder}/1.jpg`],
		imagesApprox: approx
	};
}

/** Exercises from the Push/Pull workout sheets, plus a few starters that fill gaps for other equipment. */
const BASE: ExerciseDef[] = [
	// Push A
	strength({
		id: 'goblet-squat',
		name: 'Goblet squat',
		pattern: 'squat',
		equipment: ['dumbbell'],
		muscles: ['quadriceps', 'glutes'],
		sets: 3,
		reps: [8, 12],
		cues: ['Hold DB at chest, elbows down', 'Sit between heels, chest tall']
	}),
	strength({
		id: 'db-bench-press',
		name: 'Flat DB bench press',
		pattern: 'horizontal_push',
		equipment: ['dumbbell', 'bench'],
		muscles: ['chest', 'triceps'],
		sets: 3,
		reps: [6, 10],
		stress: 'moderate',
		cues: ['Feet planted, shoulder blades pinched', 'Lower to chest, elbows ~45°']
	}),
	strength({
		id: 'bulgarian-split-squat',
		name: 'Bulgarian split squat',
		pattern: 'single_leg',
		equipment: ['dumbbell', 'bench'],
		muscles: ['quadriceps', 'glutes'],
		sets: 3,
		reps: [8, 10],
		unilateral: true,
		stress: 'moderate',
		level: 'intermediate',
		cues: ['Rear foot laces-down on bench', 'Drop straight down, front heel heavy']
	}),
	strength({
		id: 'seated-db-press',
		name: 'Seated DB overhead press',
		pattern: 'vertical_push',
		equipment: ['dumbbell', 'bench'],
		muscles: ['shoulders', 'triceps'],
		sets: 3,
		reps: [8, 10],
		stress: 'moderate',
		cues: ["Brace abs, don't arch low back", 'Press up and slightly in']
	}),
	strength({
		id: 'db-fly',
		name: 'DB flat fly',
		pattern: 'chest_iso',
		equipment: ['dumbbell', 'bench'],
		muscles: ['chest'],
		sets: 2,
		reps: [10, 12],
		cues: ['Slight, fixed bend in elbows', 'Open wide to a chest stretch, hug back up']
	}),
	strength({
		id: 'db-lateral-raise',
		name: 'DB lateral raise',
		pattern: 'shoulder_iso',
		equipment: ['dumbbell'],
		muscles: ['shoulders'],
		sets: 2,
		reps: [12, 15],
		cues: ['Slight bend in elbows', 'Raise to shoulder height, lower slow']
	}),
	strength({
		id: 'overhead-db-triceps',
		name: 'Overhead DB triceps ext.',
		pattern: 'triceps',
		equipment: ['dumbbell'],
		muscles: ['triceps'],
		sets: 2,
		reps: [10, 12],
		cues: ['Both hands on one DB', 'Elbows point up, lower behind head']
	}),
	strength({
		id: 'one-arm-overhead-triceps',
		name: 'One-arm overhead DB triceps ext.',
		pattern: 'triceps',
		equipment: ['dumbbell'],
		muscles: ['triceps'],
		sets: 2,
		reps: [10, 12],
		unilateral: true,
		source: 'starter',
		cues: [
			'Hold the handle normally; works with PowerBlocks',
			'Other hand supports the working elbow',
			'Lower behind head, extend to lockout'
		]
	}),
	strength({
		id: 'overhead-triceps-iso-hold',
		name: 'Overhead triceps iso hold',
		pattern: 'triceps',
		equipment: ['dumbbell'],
		muscles: ['triceps'],
		sets: 2,
		reps: [20, 30],
		unit: 'seconds',
		unilateral: true,
		source: 'starter',
		cues: [
			'One dumbbell by the handle, arm straight overhead',
			'Lower behind head to a 90° elbow, then hold still',
			'Elbow points up, abs braced, keep breathing'
		]
	}),
	// Push B
	strength({
		id: 'reverse-lunge',
		name: 'Reverse lunge / step-up',
		pattern: 'single_leg',
		equipment: ['dumbbell'],
		muscles: ['quadriceps', 'glutes'],
		sets: 3,
		reps: [8, 10],
		unilateral: true,
		cues: ['Step back, both knees ~90°', 'Push through front heel to stand']
	}),
	strength({
		id: 'incline-db-press',
		name: 'Incline DB press',
		pattern: 'horizontal_push',
		equipment: ['dumbbell', 'bench'],
		muscles: ['chest', 'shoulders'],
		sets: 3,
		reps: [8, 10],
		cues: ['Bench at 30–45°', 'Press up over upper chest']
	}),
	strength({
		id: 'heel-elevated-goblet-squat',
		name: 'Heel-elevated goblet squat',
		pattern: 'squat',
		equipment: ['dumbbell'],
		muscles: ['quadriceps'],
		sets: 3,
		reps: [10, 12],
		cues: ['Heels on a small plate or board', 'Knees travel forward, torso upright']
	}),
	strength({
		id: 'push-up',
		name: 'Push-ups',
		pattern: 'horizontal_push',
		muscles: ['chest', 'triceps'],
		sets: 2,
		reps: [8, 20],
		target: 'max − 2',
		cues: ['Body in one straight line', 'Chest to fist height; knees OK']
	}),
	strength({
		id: 'db-upright-row',
		name: 'DB upright row',
		pattern: 'shoulder_iso',
		equipment: ['dumbbell'],
		muscles: ['shoulders', 'traps'],
		sets: 2,
		reps: [10, 15],
		stress: 'moderate',
		cues: [
			'DBs shoulder-width apart, not touching',
			'Lead with elbows, stop at shoulder height',
			'Moderate weight; skip it if shoulders pinch'
		]
	}),
	strength({
		id: 'db-skull-crusher',
		name: 'DB skull crusher',
		pattern: 'triceps',
		equipment: ['dumbbell', 'bench'],
		muscles: ['triceps'],
		sets: 2,
		reps: [10, 12],
		cues: ['On bench, DBs over shoulders, palms in', 'Bend elbows to lower beside head, extend']
	}),
	strength({
		id: 'standing-calf-raise',
		name: 'Standing calf raise',
		pattern: 'calves',
		muscles: ['calves'],
		sets: 2,
		reps: [12, 15],
		cues: ['Rise all the way onto toes', 'Pause at top, lower 2–3 sec']
	}),
	// Pull A
	strength({
		id: 'db-rdl',
		name: 'DB Romanian deadlift',
		pattern: 'hinge',
		equipment: ['dumbbell'],
		muscles: ['hamstrings', 'glutes'],
		sets: 3,
		reps: [8, 12],
		cues: ['Soft knees, push hips back', 'DBs slide down thighs, flat back']
	}),
	strength({
		id: 'one-arm-db-row',
		name: 'One-arm DB row',
		pattern: 'horizontal_pull',
		equipment: ['dumbbell', 'bench'],
		muscles: ['lats', 'middle back'],
		sets: 3,
		reps: [8, 12],
		unilateral: true,
		cues: ['Hand and knee on bench', 'Pull elbow toward hip']
	}),
	strength({
		id: 'db-hip-thrust',
		name: 'DB hip thrust',
		pattern: 'glute',
		equipment: ['dumbbell', 'bench'],
		muscles: ['glutes'],
		sets: 3,
		reps: [10, 15],
		cues: ['Upper back on bench, DB on hips', 'Squeeze glutes, ribs down at top']
	}),
	strength({
		id: 'band-lat-pulldown',
		name: 'Band lat pulldown',
		pattern: 'vertical_pull',
		equipment: ['band'],
		muscles: ['lats'],
		sets: 3,
		reps: [12, 15],
		cues: ['Anchor band high, kneel', 'Drive elbows down to sides']
	}),
	strength({
		id: 'band-face-pull',
		name: 'Band face pulls',
		pattern: 'rear_delt',
		equipment: ['band'],
		muscles: ['shoulders', 'middle back'],
		sets: 2,
		reps: [15, 20],
		cues: ['Anchor at face height', 'Pull to eyes, elbows high and wide']
	}),
	strength({
		id: 'incline-db-curl',
		name: 'Incline DB curl',
		pattern: 'biceps',
		equipment: ['dumbbell', 'bench'],
		muscles: ['biceps'],
		sets: 2,
		reps: [10, 12],
		cues: [
			'Sit back on incline bench, arms hang',
			'Elbows stay back; curl, lower slow',
			'Go lighter than your standing curl'
		]
	}),
	strength({
		id: 'db-curl',
		name: 'DB curl',
		pattern: 'biceps',
		equipment: ['dumbbell'],
		muscles: ['biceps'],
		sets: 2,
		reps: [10, 12],
		cues: ['Elbows pinned to sides', 'No swinging, lower slow']
	}),
	// Pull B
	strength({
		id: 'single-leg-db-rdl',
		name: 'Single-leg DB RDL',
		pattern: 'hinge',
		equipment: ['dumbbell'],
		muscles: ['hamstrings', 'glutes'],
		sets: 3,
		reps: [8, 10],
		unilateral: true,
		level: 'intermediate',
		cues: ['Hinge on one leg, other reaches back', 'Hips square; hold a wall if needed']
	}),
	strength({
		id: 'chest-supported-db-row',
		name: 'Chest-supported DB row',
		pattern: 'horizontal_pull',
		equipment: ['dumbbell', 'bench'],
		muscles: ['middle back', 'lats'],
		sets: 3,
		reps: [10, 12],
		cues: ['Chest on incline bench', 'Row to ribs, squeeze shoulder blades']
	}),
	strength({
		id: 'feet-up-single-leg-bridge',
		name: 'Feet-up single-leg glute bridge',
		pattern: 'glute',
		equipment: ['bench'],
		muscles: ['glutes', 'hamstrings'],
		sets: 3,
		reps: [10, 12],
		unilateral: true,
		cues: [
			'Back on floor, one heel on bench',
			'Drive heel down, hips up, 1-sec squeeze',
			'Too easy? Rest a DB on your hip'
		]
	}),
	strength({
		id: 'db-pullover',
		name: 'DB pullover',
		pattern: 'vertical_pull',
		equipment: ['dumbbell', 'bench'],
		muscles: ['lats', 'chest'],
		sets: 2,
		reps: [10, 12],
		cues: [
			'Lie on bench, one DB in both hands',
			'Slight elbow bend; lower behind head',
			'Pull back over chest with your lats'
		]
	}),
	strength({
		id: 'db-rear-delt-fly',
		name: 'DB rear delt fly',
		pattern: 'rear_delt',
		equipment: ['dumbbell'],
		muscles: ['shoulders'],
		sets: 2,
		reps: [12, 15],
		cues: ['Hinge forward, flat back', 'Raise arms out wide, lead with elbows']
	}),
	strength({
		id: 'hammer-curl',
		name: 'Hammer curl',
		pattern: 'biceps',
		equipment: ['dumbbell'],
		muscles: ['biceps', 'forearms'],
		sets: 2,
		reps: [10, 12],
		cues: ['Palms face each other', 'Elbows pinned, lower slow']
	}),
	strength({
		id: 'db-spider-curl',
		name: 'DB spider curl',
		pattern: 'biceps',
		equipment: ['dumbbell', 'bench'],
		muscles: ['biceps'],
		sets: 2,
		reps: [10, 12],
		cues: ['Chest on incline bench, arms hang straight down', 'Curl up, squeeze hard at the top']
	}),

	// Starters: fill slots when equipment is limited
	strength({
		id: 'bodyweight-squat',
		name: 'Bodyweight squat',
		pattern: 'squat',
		muscles: ['quadriceps', 'glutes'],
		reps: [12, 20],
		source: 'starter',
		cues: ['Feet shoulder-width, toes slightly out', 'Sit down and back, chest tall']
	}),
	strength({
		id: 'split-squat',
		name: 'Split squat',
		pattern: 'single_leg',
		muscles: ['quadriceps', 'glutes'],
		reps: [10, 12],
		unilateral: true,
		source: 'starter',
		cues: ['Long stance, back heel up', 'Drop the back knee straight down']
	}),
	strength({
		id: 'glute-bridge',
		name: 'Glute bridge',
		pattern: 'glute',
		muscles: ['glutes'],
		reps: [12, 20],
		source: 'starter',
		cues: ['Feet flat, knees bent', 'Drive hips up, squeeze 1 sec']
	}),
	strength({
		id: 'db-floor-press',
		name: 'DB floor press',
		pattern: 'horizontal_push',
		equipment: ['dumbbell'],
		muscles: ['chest', 'triceps'],
		reps: [8, 12],
		source: 'starter',
		cues: ['Lie on floor, knees bent', 'Upper arms touch floor, press up']
	}),
	strength({
		id: 'standing-db-press',
		name: 'Standing DB overhead press',
		pattern: 'vertical_push',
		equipment: ['dumbbell'],
		muscles: ['shoulders', 'triceps'],
		reps: [8, 10],
		stress: 'moderate',
		source: 'starter',
		cues: ['Squeeze glutes, ribs down', 'Press up and slightly in']
	}),
	strength({
		id: 'pike-push-up',
		name: 'Pike push-up',
		pattern: 'vertical_push',
		muscles: ['shoulders', 'triceps'],
		reps: [6, 10],
		level: 'intermediate',
		stress: 'moderate',
		source: 'starter',
		cues: ['Hips high, body in an upside-down V', 'Lower head toward hands']
	}),
	strength({
		id: 'db-bent-over-row',
		name: 'DB bent-over row',
		pattern: 'horizontal_pull',
		equipment: ['dumbbell'],
		muscles: ['middle back', 'lats'],
		reps: [8, 12],
		source: 'starter',
		cues: ['Hinge to ~45°, flat back', 'Row both DBs to hips']
	}),
	strength({
		id: 'band-row',
		name: 'Band seated row',
		pattern: 'horizontal_pull',
		equipment: ['band'],
		muscles: ['middle back'],
		reps: [12, 15],
		source: 'starter',
		cues: ['Band around feet, sit tall', 'Pull elbows back, squeeze shoulder blades']
	}),
	strength({
		id: 'pull-up',
		name: 'Pull-up / assisted pull-up',
		pattern: 'vertical_pull',
		equipment: ['pullup_bar'],
		muscles: ['lats', 'biceps'],
		reps: [3, 8],
		level: 'intermediate',
		source: 'starter',
		cues: ['Start from a dead hang', 'Drive elbows down; use a band to assist']
	}),
	strength({
		id: 'band-pull-apart',
		name: 'Band pull-apart',
		pattern: 'rear_delt',
		equipment: ['band'],
		muscles: ['shoulders', 'middle back'],
		reps: [15, 20],
		source: 'starter',
		cues: ['Arms straight at shoulder height', 'Pull band to chest, squeeze back']
	}),
	strength({
		id: 'bench-dip',
		name: 'Bench dip',
		pattern: 'triceps',
		equipment: ['bench'],
		muscles: ['triceps'],
		reps: [8, 15],
		stress: 'high',
		source: 'starter',
		cues: ['Hands on bench edge behind you', 'Lower to 90° at the elbow, no deeper']
	}),
	strength({
		id: 'band-pushdown',
		name: 'Band triceps pushdown',
		pattern: 'triceps',
		equipment: ['band'],
		muscles: ['triceps'],
		reps: [12, 15],
		source: 'starter',
		cues: ['Anchor band high, elbows pinned to sides', 'Push down to lockout, return slowly']
	}),
	strength({
		id: 'band-overhead-triceps',
		name: 'Band overhead triceps ext.',
		pattern: 'triceps',
		equipment: ['band'],
		muscles: ['triceps'],
		reps: [12, 15],
		source: 'starter',
		cues: ['Anchor band low behind you, hands behind head', 'Elbows point up, extend overhead']
	}),
	strength({
		id: 'kb-overhead-triceps',
		name: 'Kettlebell overhead triceps ext.',
		pattern: 'triceps',
		equipment: ['kettlebell'],
		muscles: ['triceps'],
		reps: [10, 12],
		source: 'starter',
		cues: ['Hold the horns, bell behind your head', 'Elbows point up, extend overhead']
	}),
	strength({
		id: 'kb-floor-skull-crusher',
		name: 'Kettlebell floor skull crusher',
		pattern: 'triceps',
		equipment: ['kettlebell'],
		muscles: ['triceps'],
		reps: [10, 12],
		source: 'starter',
		cues: [
			'Lie on floor, bell by the horns over your chest',
			'Bend elbows to lower beside head, extend'
		]
	}),
	strength({
		id: 'diamond-push-up',
		name: 'Close-grip push-up',
		pattern: 'triceps',
		muscles: ['triceps', 'chest'],
		reps: [6, 12],
		source: 'starter',
		cues: [
			'Hands under shoulders, elbows brush your sides',
			'Knees down is fine; body stays straight'
		]
	}),
	strength({
		id: 'counter-triceps-extension',
		name: 'Counter triceps extension',
		pattern: 'triceps',
		muscles: ['triceps'],
		reps: [10, 15],
		source: 'starter',
		cues: [
			'Hands on a sturdy counter, step back and lean in',
			'Bend elbows to bring forehead toward hands, push back',
			'Step further back to make it harder'
		]
	}),
	strength({
		id: 'prone-t-raise',
		name: 'Prone T raise',
		pattern: 'rear_delt',
		muscles: ['shoulders', 'middle back'],
		reps: [10, 15],
		source: 'starter',
		cues: ['Face down, arms out in a T, thumbs up', 'Squeeze shoulder blades, lift arms, pause']
	}),
	strength({
		id: 'band-curl',
		name: 'Band curl',
		pattern: 'biceps',
		equipment: ['band'],
		muscles: ['biceps'],
		reps: [12, 15],
		source: 'starter',
		cues: ['Stand on band, elbows pinned', 'Curl up, lower slow']
	}),
	strength({
		id: 'band-hammer-curl',
		name: 'Band hammer curl',
		pattern: 'biceps',
		equipment: ['band'],
		muscles: ['biceps', 'forearms'],
		reps: [12, 15],
		source: 'starter',
		cues: ['Stand on band, palms face each other', 'Elbows pinned, lower slow']
	}),
	strength({
		id: 'kb-curl',
		name: 'Kettlebell curl',
		pattern: 'biceps',
		equipment: ['kettlebell'],
		muscles: ['biceps'],
		reps: [10, 12],
		source: 'starter',
		cues: ['Hold the handle, bell hanging below', 'Elbows pinned, curl, lower slow']
	}),
	strength({
		id: 'kb-hammer-curl',
		name: 'Kettlebell hammer curl',
		pattern: 'biceps',
		equipment: ['kettlebell'],
		muscles: ['biceps', 'forearms'],
		reps: [10, 12],
		source: 'starter',
		cues: ['Grip the horns, palms facing in', 'Elbows pinned, curl, lower slow']
	}),
	strength({
		id: 'towel-iso-curl',
		name: 'Towel isometric curl',
		pattern: 'biceps',
		muscles: ['biceps'],
		reps: [20, 30],
		unit: 'seconds',
		source: 'starter',
		cues: [
			'Stand on the middle of a towel, hold both ends',
			'Curl to a 90° elbow and pull up hard against it',
			'Hold; keep breathing'
		]
	}),
	strength({
		id: 'doorframe-curl',
		name: 'Doorframe curl',
		pattern: 'biceps',
		muscles: ['biceps'],
		reps: [10, 15],
		unilateral: true,
		source: 'starter',
		cues: [
			'Grip a doorframe, feet close to it, lean back with arm straight',
			'Curl your body toward the frame, elbow up and still',
			'Walk feet closer to make it harder'
		]
	}),
	strength({
		id: 'flexed-arm-hang',
		name: 'Chin-up hold',
		pattern: 'biceps',
		equipment: ['pullup_bar'],
		muscles: ['biceps', 'lats'],
		reps: [10, 20],
		unit: 'seconds',
		level: 'intermediate',
		source: 'starter',
		cues: ['Palms facing you, chin over the bar', 'Hold the top; step or jump up if needed']
	}),
	strength({
		id: 'kb-swing',
		name: 'Kettlebell swing',
		pattern: 'hinge',
		equipment: ['kettlebell'],
		muscles: ['glutes', 'hamstrings'],
		reps: [12, 20],
		stress: 'moderate',
		level: 'intermediate',
		source: 'starter',
		cues: ['Hike the bell back between thighs', 'Snap hips forward; arms just guide']
	}),

	// Mobility + core A
	stretch({
		id: 'cat-cow',
		name: 'Cat-cow',
		pattern: 'stretch',
		focus: 'spine',
		reps: [8, 8],
		target: '8 slow reps',
		cues: ['Round up, then let belly sink', 'Move with your breath']
	}),
	stretch({
		id: 'worlds-greatest-stretch',
		name: "World's greatest stretch",
		pattern: 'stretch',
		focus: 'hips',
		reps: [4, 4],
		unilateral: true,
		cues: ['Deep lunge, hand inside front foot', 'Rotate and reach the other arm up']
	}),
	stretch({
		id: 'half-kneeling-hip-flexor',
		name: 'Half-kneeling hip flexor',
		pattern: 'stretch',
		focus: 'hips',
		unit: 'seconds',
		reps: [30, 45],
		unilateral: true,
		cues: ['Squeeze glute of the down knee', 'Shift hips forward, ribs down']
	}),
	stretch({
		id: 'band-hamstring-stretch',
		name: 'Band hamstring stretch',
		pattern: 'stretch',
		focus: 'hamstrings',
		equipment: ['band'],
		unit: 'seconds',
		reps: [30, 45],
		unilateral: true,
		cues: ['Lie on back, band around one foot', 'Straight leg up until mild tension']
	}),
	stretch({
		id: 'thoracic-open-book',
		name: 'Thoracic open book',
		pattern: 'stretch',
		focus: 'thoracic',
		reps: [6, 6],
		unilateral: true,
		cues: ['Side-lying, knees bent and stacked', 'Open top arm, follow with eyes']
	}),
	stretch({
		id: 'figure-4-stretch',
		name: 'Figure-4 glute stretch',
		pattern: 'stretch',
		focus: 'glutes',
		unit: 'seconds',
		reps: [30, 45],
		unilateral: true,
		cues: ['Ankle across opposite knee', 'Pull thigh toward chest']
	}),
	stretch({
		id: 'childs-pose-reach',
		name: "Child's pose reach",
		pattern: 'stretch',
		focus: 'lats',
		unit: 'seconds',
		reps: [45, 45],
		cues: ['Sit hips back to heels', 'Walk hands forward, breathe into back']
	}),
	core({
		id: 'bird-dog',
		name: 'Bird dog',
		pattern: 'core',
		focus: 'anti-rotation',
		sets: 2,
		reps: [6, 6],
		unilateral: true,
		target: '2 × 6 / side, 3s hold',
		cues: ['Opposite arm and leg reach long', 'Hips level, no twisting']
	}),
	core({
		id: 'mcgill-curl-up',
		name: 'McGill curl-up',
		pattern: 'core',
		focus: 'flexion',
		sets: 2,
		reps: [5, 5],
		target: '2 × 5, 8–10s hold',
		cues: ['Hands under low back, one knee bent', 'Lift head and shoulders an inch']
	}),
	core({
		id: 'front-plank',
		name: 'Front plank',
		pattern: 'core',
		focus: 'anti-extension',
		sets: 2,
		unit: 'seconds',
		reps: [20, 40],
		cues: ['Elbows under shoulders', "Squeeze glutes, don't let hips sag"]
	}),
	core({
		id: 'band-pallof-press',
		name: 'Band Pallof press',
		pattern: 'core',
		focus: 'anti-rotation',
		equipment: ['band'],
		sets: 2,
		reps: [10, 10],
		unilateral: true,
		cues: ['Band anchored to your side, chest high', 'Press out and resist the twist']
	}),
	// Mobility + core B
	stretch({
		id: 'deep-squat-hold',
		name: 'Deep squat hold',
		pattern: 'stretch',
		focus: 'hips',
		sets: 2,
		unit: 'seconds',
		reps: [30, 30],
		cues: ['Heels down, elbows push knees out', 'Hold a doorframe if needed']
	}),
	stretch({
		id: '90-90-hip-switch',
		name: '90/90 hip switches',
		pattern: 'stretch',
		focus: 'hips',
		reps: [6, 6],
		unilateral: true,
		cues: ['Sit with both knees bent to 90°', 'Rotate knees side to side, chest tall']
	}),
	stretch({
		id: 'couch-stretch',
		name: 'Couch stretch (bench)',
		pattern: 'stretch',
		focus: 'quads',
		equipment: ['bench'],
		unit: 'seconds',
		reps: [30, 45],
		unilateral: true,
		cues: ['Rear foot up on bench, knee on a pad', 'Squeeze glute, stay upright']
	}),
	stretch({
		id: 'band-pass-through',
		name: 'Band pass-throughs',
		pattern: 'stretch',
		focus: 'shoulders',
		equipment: ['band'],
		reps: [10, 10],
		target: '10 slow reps',
		cues: ['Wide grip, arms straight', 'Arc band overhead to behind you']
	}),
	stretch({
		id: 'doorway-chest-stretch',
		name: 'Doorway chest stretch',
		pattern: 'stretch',
		focus: 'chest',
		unit: 'seconds',
		reps: [30, 30],
		unilateral: true,
		cues: ['Forearm on frame, elbow at shoulder', 'Step through until chest opens']
	}),
	stretch({
		id: 'seated-forward-fold',
		name: 'Seated forward fold',
		pattern: 'stretch',
		focus: 'hamstrings',
		unit: 'seconds',
		reps: [45, 45],
		cues: ['Legs straight, hinge from hips', 'Reach for shins or toes, back long']
	}),
	stretch({
		id: 'supine-spinal-twist',
		name: 'Supine spinal twist',
		pattern: 'stretch',
		focus: 'spine',
		unit: 'seconds',
		reps: [30, 30],
		unilateral: true,
		cues: ['Knees bent, drop them to one side', 'Shoulders stay flat on the floor']
	}),
	core({
		id: 'tuck-hollow-hold',
		name: 'Tuck hollow hold',
		pattern: 'core',
		focus: 'anti-extension',
		sets: 2,
		unit: 'seconds',
		reps: [15, 20],
		cues: ['Low back pressed into floor', 'Shoulders up, knees tucked']
	}),
	core({
		id: 'glute-bridge-march',
		name: 'Glute bridge march',
		pattern: 'core',
		focus: 'extension',
		sets: 2,
		reps: [8, 8],
		unilateral: true,
		cues: ['Hips up and level', 'Lift one foot at a time, no sagging']
	}),
	core({
		id: 'bear-plank',
		name: 'Bear plank hold',
		pattern: 'core',
		focus: 'anti-extension',
		sets: 2,
		unit: 'seconds',
		reps: [20, 30],
		cues: ['Hands and toes, knees 1 inch up', 'Flat back, breathe steadily']
	}),
	core({
		id: 'reverse-crunch',
		name: 'Reverse crunch',
		pattern: 'core',
		focus: 'flexion',
		sets: 2,
		reps: [10, 10],
		cues: ['Curl knees toward chest', 'Lift hips slightly, lower slowly']
	}),
	// Mobility + core C
	stretch({
		id: 'thread-the-needle',
		name: 'Thread the needle',
		pattern: 'stretch',
		focus: 'thoracic',
		reps: [5, 5],
		unilateral: true,
		cues: ['On hands and knees', 'Slide arm under, shoulder to floor']
	}),
	stretch({
		id: 'band-side-bend',
		name: 'Standing band side bend',
		pattern: 'stretch',
		focus: 'lats',
		equipment: ['band'],
		unit: 'seconds',
		reps: [30, 30],
		unilateral: true,
		cues: ['Hold band overhead, arms long', 'Lean sideways, feel the lat stretch']
	}),
	stretch({
		id: 'low-lunge-reach',
		name: 'Low lunge overhead reach',
		pattern: 'stretch',
		focus: 'hips',
		unit: 'seconds',
		reps: [30, 30],
		unilateral: true,
		cues: ['Back knee down, hips forward', 'Reach both arms up and slightly back']
	}),
	stretch({
		id: 'butterfly-stretch',
		name: 'Butterfly stretch',
		pattern: 'stretch',
		focus: 'adductors',
		unit: 'seconds',
		reps: [45, 45],
		cues: ['Soles together, sit tall', 'Let knees fall, gentle elbow press']
	}),
	stretch({
		id: 'bench-t-spine',
		name: 'Bench T-spine stretch',
		pattern: 'stretch',
		focus: 'thoracic',
		equipment: ['bench'],
		reps: [8, 8],
		target: '8 slow reps',
		cues: ['Kneel, elbows on bench, hands on head', 'Sink chest toward floor, exhale']
	}),
	stretch({
		id: 'wall-calf-stretch',
		name: 'Wall calf stretch',
		pattern: 'stretch',
		focus: 'calves',
		unit: 'seconds',
		reps: [30, 30],
		unilateral: true,
		cues: ['Back leg straight, heel down', 'Lean into wall until calf stretches']
	}),
	stretch({
		id: 'sphinx-cobra',
		name: 'Sphinx / cobra',
		pattern: 'stretch',
		focus: 'spine',
		unit: 'seconds',
		reps: [30, 45],
		cues: ['Prone, propped on forearms', 'Relax glutes, lengthen through spine']
	}),
	core({
		id: 'side-plank-knees',
		name: 'Side plank (knees)',
		pattern: 'core',
		focus: 'anti-lateral',
		sets: 2,
		unit: 'seconds',
		reps: [20, 30],
		unilateral: true,
		cues: ['Elbow under shoulder, knees bent', 'Lift hips into a straight line']
	}),
	core({
		id: 'prone-y-raise',
		name: 'Prone Y raise',
		pattern: 'core',
		focus: 'extension',
		sets: 2,
		reps: [8, 8],
		cues: ['Face down, arms in a Y', 'Lift arms and chest slightly, pause']
	}),
	core({
		id: 'plank-shoulder-taps',
		name: 'Plank shoulder taps',
		pattern: 'core',
		focus: 'anti-rotation',
		sets: 2,
		reps: [8, 8],
		unilateral: true,
		cues: ['High plank, feet wide', 'Tap shoulder, keep hips still']
	}),
	core({
		id: 'band-woodchop',
		name: 'Band woodchop',
		pattern: 'core',
		focus: 'rotation',
		equipment: ['band'],
		sets: 2,
		reps: [10, 10],
		unilateral: true,
		cues: ['Band anchored high to one side', 'Pull down across body, slow return']
	})
];

export const CATALOG: ExerciseDef[] = BASE.map(withPhotos);

/** The original sheets, slot for slot. The first program a user generates follows these when their equipment allows. */
export const SHEET_LAYOUT: Record<string, string[]> = {
	'push-A': [
		'goblet-squat',
		'db-bench-press',
		'bulgarian-split-squat',
		'seated-db-press',
		'db-fly',
		'overhead-db-triceps',
		'db-lateral-raise',
		'one-arm-overhead-triceps'
	],
	'pull-A': [
		'db-rdl',
		'one-arm-db-row',
		'db-hip-thrust',
		'band-lat-pulldown',
		'db-curl',
		'band-face-pull',
		'incline-db-curl'
	],
	'push-B': [
		'reverse-lunge',
		'incline-db-press',
		'heel-elevated-goblet-squat',
		'push-up',
		'db-skull-crusher',
		'db-upright-row',
		'overhead-triceps-iso-hold',
		'standing-calf-raise'
	],
	'pull-B': [
		'single-leg-db-rdl',
		'chest-supported-db-row',
		'feet-up-single-leg-bridge',
		'db-pullover',
		'hammer-curl',
		'db-rear-delt-fly',
		'db-spider-curl'
	],
	'mobility-A': [
		'cat-cow',
		'worlds-greatest-stretch',
		'half-kneeling-hip-flexor',
		'band-hamstring-stretch',
		'thoracic-open-book',
		'figure-4-stretch',
		'childs-pose-reach',
		'bird-dog',
		'mcgill-curl-up',
		'front-plank',
		'band-pallof-press'
	],
	'mobility-B': [
		'deep-squat-hold',
		'90-90-hip-switch',
		'couch-stretch',
		'band-pass-through',
		'doorway-chest-stretch',
		'seated-forward-fold',
		'supine-spinal-twist',
		'tuck-hollow-hold',
		'glute-bridge-march',
		'bear-plank',
		'reverse-crunch'
	],
	'mobility-C': [
		'thread-the-needle',
		'band-side-bend',
		'low-lunge-reach',
		'butterfly-stretch',
		'bench-t-spine',
		'wall-calf-stretch',
		'sphinx-cobra',
		'side-plank-knees',
		'prone-y-raise',
		'plank-shoulder-taps',
		'band-woodchop'
	]
};
