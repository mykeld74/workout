/** The Plan page's "This week" panel, worked out in the phone's local time. */

export interface Finished {
	startedAt?: Date;
	completedAt: Date;
	kind: string;
}

export interface WeekSummary {
	days: {
		label: string;
		name: string;
		lift: boolean;
		mobility: boolean;
		today: boolean;
		future: boolean;
	}[];
	lifts: number;
	mobility: number;
	/** Weeks in a row with at least `streakMin` lifts; this week counts once it gets there. */
	streak: number;
}

export function mondayOf(d: Date): Date {
	const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
	return m;
}

function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

export function summarizeWeek(
	history: Finished[],
	streakMin: number,
	now = new Date()
): WeekSummary {
	const isLift = (k: string) => k !== 'mobility';
	const monday = mondayOf(now);
	const between = (start: Date, end: Date) =>
		history.filter((h) => h.completedAt >= start && h.completedAt < end);
	const liftsIn = (start: Date) =>
		between(start, addDays(start, 7)).filter((h) => isLift(h.kind)).length;

	const days = Array.from({ length: 7 }, (_, i) => {
		const start = addDays(monday, i);
		const done = between(start, addDays(start, 1));
		return {
			label: start.toLocaleDateString(undefined, { weekday: 'narrow' }),
			name: start.toLocaleDateString(undefined, { weekday: 'long' }),
			lift: done.some((h) => isLift(h.kind)),
			mobility: done.some((h) => !isLift(h.kind)),
			today: start.toDateString() === now.toDateString(),
			future: start > now
		};
	});

	const lifts = liftsIn(monday);
	let streak = lifts >= streakMin ? 1 : 0;
	for (let week = addDays(monday, -7); liftsIn(week) >= streakMin; week = addDays(week, -7))
		streak++;

	return {
		days,
		lifts,
		mobility: between(monday, addDays(monday, 7)).filter((h) => !isLift(h.kind)).length,
		streak
	};
}

export interface Activity {
	steps: { time: Date; end?: Date | null; count: number }[];
	exercise: { time: Date; minutes: number; type: string | null; distanceMeters: number | null }[];
}

/**
 * Health Connect's exercise type numbers (androidx ExerciseSessionRecord.EXERCISE_TYPE_*), for the
 * ones a home lifter is likely to log. The webhook app sends some types as these numbers.
 */
const EXERCISE_TYPES: Record<string, string> = {
	'0': 'OTHER_WORKOUT',
	'8': 'BIKING',
	'9': 'BIKING_STATIONARY',
	'10': 'BOOT_CAMP',
	'13': 'CALISTHENICS',
	'25': 'ELLIPTICAL',
	'26': 'EXERCISE_CLASS',
	'36': 'HIGH_INTENSITY_INTERVAL_TRAINING',
	'37': 'HIKING',
	'48': 'PILATES',
	'53': 'ROWING',
	'54': 'ROWING_MACHINE',
	'56': 'RUNNING',
	'57': 'RUNNING_TREADMILL',
	'68': 'STAIR_CLIMBING',
	'69': 'STAIR_CLIMBING_MACHINE',
	'70': 'STRENGTH_TRAINING',
	'71': 'STRETCHING',
	'74': 'SWIMMING_POOL',
	'79': 'WALKING',
	'81': 'WEIGHTLIFTING',
	'83': 'YOGA'
};

/** The type as a name: "57" → "RUNNING_TREADMILL"; names pass through. */
function typeName(type: string | null): string | null {
	if (!type) return null;
	return EXERCISE_TYPES[type] ?? type;
}

/** Watch workout types that are lifting, not cardio. (Samsung's Circuit Training arrives as strength training.) */
export function isLiftingType(type: string | null): boolean {
	const name = typeName(type);
	return !!name && /strength|weight|calisthenic|circuit/i.test(name);
}

/** No specific type ("Other workout", unknown numbers): could be anything, including a lift. */
export function isGenericType(type: string | null): boolean {
	const name = typeName(type);
	return !name || name === 'OTHER_WORKOUT' || /^\d+$/.test(name) || /^workout$/i.test(name);
}

/** Lifting by type, or a generic session that overlaps a workout logged here. Named cardio stays cardio. */
export function isLiftingSession(
	s: { time: Date; minutes: number; type: string | null },
	logged: Finished[]
): boolean {
	return isLiftingType(s.type) || (isGenericType(s.type) && overlapsLoggedLift(s, logged));
}

/** Watch workouts that overlap a workout logged here (give or take 15 min) are that lift. */
const SLACK_MS = 15 * 60 * 1000;
export function overlapsLoggedLift(
	e: { time: Date; minutes: number },
	history: Finished[]
): boolean {
	const start = e.time.getTime();
	const end = start + e.minutes * 60 * 1000;
	return history.some(
		(h) =>
			h.kind !== 'mobility' &&
			h.startedAt !== undefined &&
			start < h.completedAt.getTime() + SLACK_MS &&
			end > h.startedAt.getTime() - SLACK_MS
	);
}

/** "BIKING_STATIONARY" or "9" → "Biking stationary"; unknown or missing types → "Workout". */
export function exerciseName(type: string | null): string {
	const name = typeName(type);
	if (!name || /^\d+$/.test(name) || name === 'OTHER_WORKOUT') return 'Workout';
	// Health Connect has no treadmill-walking type; Samsung sends treadmill walks as this.
	if (name.replace(/^EXERCISE_TYPE_/, '') === 'RUNNING_TREADMILL') return 'Walking (treadmill)';
	const words = name
		.replace(/^EXERCISE_TYPE_/, '')
		.replace('HIGH_INTENSITY_INTERVAL_TRAINING', 'HIIT')
		.replace('_TREADMILL', ' (treadmill)')
		.replace(/_/g, ' ')
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ActivitySummary {
	stepsPerDay: number | null;
	stepsDays: number;
	cardio: { name: string; minutes: number; miles: number | null; time: Date }[];
	cardioMinutes: number;
}

/** Steps (average per day so far) and cardio sessions for the current week, in local time. */
export function summarizeActivity(
	activity: Activity,
	history: Finished[] = [],
	now = new Date()
): ActivitySummary {
	const monday = mondayOf(now);
	const steps = activity.steps.filter((s) => s.time >= monday && s.time <= now);
	// A whole-day total covers that day. Partials fill days that don't have one.
	const perDay = new Map<string, { full: number | null; partial: number }>();
	for (const s of steps) {
		const key = s.time.toDateString();
		const d = perDay.get(key) ?? { full: null, partial: 0 };
		const isFull = !!s.end && s.end.getTime() - s.time.getTime() >= 20 * 60 * 60 * 1000;
		if (isFull) d.full = Math.max(d.full ?? 0, s.count);
		else d.partial += s.count;
		perDay.set(key, d);
	}
	const days = perDay.size;
	const total = [...perDay.values()].reduce((sum, d) => sum + (d.full ?? d.partial), 0);
	const cardio = activity.exercise
		.filter((e) => e.time >= monday && e.time <= now && !isLiftingSession(e, history))
		.map((e) => ({
			name: exerciseName(e.type),
			minutes: e.minutes,
			miles: e.distanceMeters ? Math.round((e.distanceMeters / 1609.34) * 10) / 10 : null,
			time: e.time
		}));
	return {
		stepsPerDay: days ? Math.round(total / days) : null,
		stepsDays: days,
		cardio,
		cardioMinutes: cardio.reduce((sum, c) => sum + c.minutes, 0)
	};
}
