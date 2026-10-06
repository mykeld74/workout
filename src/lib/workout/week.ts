/** The Plan page's "This week" panel, worked out in the phone's local time. */

export interface Finished {
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
	steps: { time: Date; count: number }[];
	exercise: { time: Date; minutes: number; type: string | null; distanceMeters: number | null }[];
}

/** Workouts the watch logged that aren't lifting (the app already tracks those). */
export function isCardio(type: string | null): boolean {
	return !type || !/strength|weight|calisthenic/i.test(type);
}

/** "BIKING_STATIONARY" → "Biking stationary"; numeric or missing types → "Workout". */
export function exerciseName(type: string | null): string {
	if (!type || /^\d+$/.test(type)) return 'Workout';
	const words = type
		.replace(/^EXERCISE_TYPE_/, '')
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
export function summarizeActivity(activity: Activity, now = new Date()): ActivitySummary {
	const monday = mondayOf(now);
	const steps = activity.steps.filter((s) => s.time >= monday && s.time <= now);
	const days = new Set(steps.map((s) => s.time.toDateString())).size;
	const total = steps.reduce((sum, s) => sum + s.count, 0);
	const cardio = activity.exercise
		.filter((e) => e.time >= monday && e.time <= now && isCardio(e.type))
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
