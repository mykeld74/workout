import {
	and,
	arrayContained,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	notInArray,
	sql
} from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	exercise,
	exercisePref,
	profile as profileTable,
	program,
	setLog,
	workout,
	workoutExercise,
	workoutSession
} from '#lib/server/db/schema.ts';
import { CATALOG } from '#lib/workout/catalog.ts';
import {
	deloadEveryFor,
	generateProgram,
	isAppropriate,
	isAvailable,
	isDeloadWeek,
	pickReplacement,
	prescribe,
	replacementOptions,
	roleFor,
	targetText
} from '#lib/workout/generator.ts';
import { DEFAULT_INCREMENT, estimatedMax, volume } from '#lib/workout/progression.ts';
import {
	ageFromBirthDate,
	type Equipment,
	type ExerciseDef,
	type ExercisePrefs,
	type Experience,
	type Guidelines,
	type Profile,
	type Role,
	type StoredProfile
} from '#lib/workout/types.ts';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let catalogReady: Promise<void> | undefined;

/**
 * Writes the built-in exercises (from the workout sheets) to the database, so edits to the
 * catalog — new cues, photos — reach existing rows. Runs once per server instance.
 */
export function ensureCatalog(): Promise<void> {
	catalogReady ??= (async () => {
		const columns = Object.keys(CATALOG[0]).filter((k) => k !== 'id') as (keyof ExerciseDef)[];
		const set = Object.fromEntries(
			columns.map((k) => [k, sql.raw(`excluded."${exercise[k].name}"`)])
		);
		await db.insert(exercise).values(CATALOG).onConflictDoUpdate({ target: exercise.id, set });
	})().catch((err) => {
		catalogReady = undefined;
		throw err;
	});
	return catalogReady;
}

export async function loadPool(): Promise<ExerciseDef[]> {
	await ensureCatalog();
	return (await db.select().from(exercise)) as ExerciseDef[];
}

// ─── Profile and exercise preferences ────────────────────────────────────────

export async function getPrefs(userId: string): Promise<ExercisePrefs> {
	const rows = await db
		.select({ exerciseId: exercisePref.exerciseId, status: exercisePref.status })
		.from(exercisePref)
		.where(eq(exercisePref.userId, userId));
	return {
		favorites: new Set(rows.filter((r) => r.status === 'favorite').map((r) => r.exerciseId)),
		hidden: new Set(rows.filter((r) => r.status === 'hidden').map((r) => r.exerciseId))
	};
}

/** Stars or hides an exercise; `null` clears it. */
export async function setPref(
	userId: string,
	exerciseId: string,
	status: 'favorite' | 'hidden' | null
) {
	if (!status) {
		await db
			.delete(exercisePref)
			.where(and(eq(exercisePref.userId, userId), eq(exercisePref.exerciseId, exerciseId)));
		return;
	}
	await db
		.insert(exercisePref)
		.values({ userId, exerciseId, status })
		.onConflictDoUpdate({
			target: [exercisePref.userId, exercisePref.exerciseId],
			set: { status }
		});
}

/** The profile plus the user's starred and hidden exercises, ready for the generator. */
export async function getProfile(userId: string): Promise<StoredProfile | undefined> {
	const [row] = await db.select().from(profileTable).where(eq(profileTable.userId, userId));
	if (!row) return undefined;
	return {
		birthDate: row.birthDate,
		age: ageFromBirthDate(row.birthDate),
		equipment: row.equipment as Equipment[],
		experience: row.experience as Experience,
		powerblock: row.powerblock,
		weightIncrement: row.weightIncrement,
		prefs: await getPrefs(userId)
	};
}

export async function saveProfile(
	userId: string,
	p: {
		birthDate: string;
		equipment: Equipment[];
		experience: Experience;
		powerblock: boolean;
		weightIncrement: number;
	}
) {
	await db
		.insert(profileTable)
		.values({ userId, ...p })
		.onConflictDoUpdate({
			target: profileTable.userId,
			set: { ...p, updatedAt: new Date() }
		});
}

// ─── Plans ───────────────────────────────────────────────────────────────────

async function activeProgramRow(userId: string) {
	const [row] = await db
		.select()
		.from(program)
		.where(and(eq(program.userId, userId), isNull(program.archivedAt)))
		.orderBy(desc(program.createdAt))
		.limit(1);
	return row;
}

export function weekOf(createdAt: Date): number {
	return Math.floor((Date.now() - createdAt.getTime()) / WEEK_MS) + 1;
}

/** Week number and whether it's a lighter week, for a plan. */
function planWeek(p: { createdAt: Date; guidelines: Guidelines }, age: number) {
	const week = weekOf(p.createdAt);
	const deloadEvery = p.guidelines.deloadEvery ?? deloadEveryFor(age);
	return { week, deloadEvery, deload: isDeloadWeek(week, deloadEvery) };
}

/** Archives the current plan (if any) and generates a fresh one that avoids its exercises. */
export async function createProgram(userId: string, profile: Profile) {
	const pool = await loadPool();
	const prefs = profile.prefs ?? (await getPrefs(userId));
	const current = await activeProgramRow(userId);
	const [{ count: pastPrograms }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(program)
		.where(eq(program.userId, userId));

	let previousIds: string[] = [];
	if (current) {
		const rows = await db
			.select({ id: workoutExercise.exerciseId })
			.from(workoutExercise)
			.innerJoin(workout, eq(workout.id, workoutExercise.workoutId))
			.where(eq(workout.programId, current.id));
		previousIds = rows.map((r) => r.id);
		await db.update(program).set({ archivedAt: new Date() }).where(eq(program.id, current.id));
	}

	const plan = generateProgram({
		profile: { ...profile, prefs },
		pool,
		previousIds,
		useSheets: pastPrograms === 0
	});

	const [created] = await db
		.insert(program)
		.values({ userId, guidelines: plan.guidelines })
		.returning({ id: program.id });

	const workoutRows = await db
		.insert(workout)
		.values(
			plan.workouts.map((w, position) => ({
				programId: created.id,
				kind: w.kind,
				variant: w.variant,
				title: w.title,
				focus: w.focus,
				warmup: w.warmup,
				position
			}))
		)
		.returning({ id: workout.id, position: workout.position });

	const idByPosition = new Map(workoutRows.map((r) => [r.position, r.id]));
	const exerciseRows = plan.workouts.flatMap((w, wi) =>
		w.exercises.map((e, position) => ({ ...e, workoutId: idByPosition.get(wi)!, position }))
	);
	if (exerciseRows.length) await db.insert(workoutExercise).values(exerciseRows);

	return created.id;
}

export async function getDashboard(userId: string) {
	const active = await activeProgramRow(userId);
	if (!active) return null;
	const profile = await getProfile(userId);

	const workouts = await db
		.select()
		.from(workout)
		.where(eq(workout.programId, active.id))
		.orderBy(asc(workout.position));

	const counts = await db
		.select({
			workoutId: workoutExercise.workoutId,
			count: sql<number>`count(*)::int`
		})
		.from(workoutExercise)
		.innerJoin(workout, eq(workout.id, workoutExercise.workoutId))
		.where(eq(workout.programId, active.id))
		.groupBy(workoutExercise.workoutId);

	const sessions = await db
		.select({
			id: workoutSession.id,
			workoutId: workoutSession.workoutId,
			startedAt: workoutSession.startedAt,
			completedAt: workoutSession.completedAt,
			title: workout.title,
			kind: workout.kind
		})
		.from(workoutSession)
		.innerJoin(workout, eq(workout.id, workoutSession.workoutId))
		.where(eq(workoutSession.userId, userId))
		.orderBy(desc(workoutSession.startedAt))
		.limit(20);

	// Everything finished in the last 26 weeks, for the weekly view and streak.
	const history = await db
		.select({
			startedAt: workoutSession.startedAt,
			completedAt: workoutSession.completedAt,
			kind: workout.kind
		})
		.from(workoutSession)
		.innerJoin(workout, eq(workout.id, workoutSession.workoutId))
		.where(
			and(
				eq(workoutSession.userId, userId),
				isNotNull(workoutSession.completedAt),
				gt(workoutSession.completedAt, new Date(Date.now() - 26 * WEEK_MS))
			)
		);

	const inProgram = sessions.filter(
		(s) => s.completedAt && workouts.some((w) => w.id === s.workoutId)
	);

	/** Next in rotation: the one after the most recently completed workout of the same type. */
	function nextOf(kind: 'strength' | 'mobility') {
		const list = workouts.filter((w) =>
			kind === 'mobility' ? w.kind === 'mobility' : w.kind !== 'mobility'
		);
		const last = inProgram.find((s) => list.some((w) => w.id === s.workoutId));
		if (!last) return list[0];
		const i = list.findIndex((w) => w.id === last.workoutId);
		return list[(i + 1) % list.length];
	}

	const doneCount = new Map<number, number>();
	for (const s of inProgram) doneCount.set(s.workoutId, (doneCount.get(s.workoutId) ?? 0) + 1);

	return {
		program: { ...active, ...planWeek(active, profile?.age ?? 40) },
		workouts: workouts.map((w) => ({
			...w,
			exerciseCount: counts.find((c) => c.workoutId === w.id)?.count ?? 0,
			timesDone: doneCount.get(w.id) ?? 0
		})),
		nextStrength: nextOf('strength'),
		nextMobility: nextOf('mobility'),
		inProgress: sessions.find((s) => !s.completedAt) ?? null,
		recent: sessions.filter((s) => s.completedAt).slice(0, 6),
		history: history.map((h) => ({
			startedAt: h.startedAt,
			completedAt: h.completedAt!,
			kind: h.kind
		}))
	};
}

async function ownedWorkout(userId: string, workoutId: number) {
	const [row] = await db
		.select({ workout, program })
		.from(workout)
		.innerJoin(program, eq(program.id, workout.programId))
		.where(and(eq(workout.id, workoutId), eq(program.userId, userId)));
	return row;
}

/** A plan item the user owns, with its workout and whether the plan is still active. */
async function ownedItem(userId: string, workoutExerciseId: number) {
	const [row] = await db
		.select({ item: workoutExercise, workoutId: workout.id, archivedAt: program.archivedAt })
		.from(workoutExercise)
		.innerJoin(workout, eq(workout.id, workoutExercise.workoutId))
		.innerJoin(program, eq(program.id, workout.programId))
		.where(and(eq(workoutExercise.id, workoutExerciseId), eq(program.userId, userId)));
	return row && row.archivedAt === null ? row : undefined;
}

async function workoutExercises(workoutId: number) {
	return db
		.select({ item: workoutExercise, exercise })
		.from(workoutExercise)
		.innerJoin(exercise, eq(exercise.id, workoutExercise.exerciseId))
		.where(eq(workoutExercise.workoutId, workoutId))
		.orderBy(asc(workoutExercise.position));
}

export async function getWorkout(userId: string, workoutId: number) {
	const owned = await ownedWorkout(userId, workoutId);
	if (!owned) return null;
	const exercises = await workoutExercises(workoutId);
	const active = owned.program.archivedAt === null;

	// What each slot could be swapped to, and what could be added, for the editor.
	const alternatives: Record<number, { id: string; name: string; source: string }[]> = {};
	let addable: { id: string; name: string; pattern: string; favorite: boolean }[] = [];
	const profile = active ? await getProfile(userId) : undefined;
	if (profile) {
		const pool = await loadPool();
		const inWorkout = exercises.map((e) => e.exercise.id);
		for (const { item, exercise: current } of exercises) {
			alternatives[item.id] = replacementOptions(pool, current as ExerciseDef, inWorkout, profile)
				.slice(0, 40)
				.map(({ id, name, source }) => ({ id, name, source }));
		}
		const categories =
			owned.workout.kind === 'mobility' ? ['mobility', 'core'] : ['strength', 'core'];
		addable = pool
			.filter(
				(ex) =>
					categories.includes(ex.category) &&
					!inWorkout.includes(ex.id) &&
					isAvailable(ex, profile.equipment) &&
					isAppropriate(ex, profile)
			)
			.map((ex) => ({
				id: ex.id,
				name: ex.name,
				pattern: ex.pattern,
				favorite: !!profile.prefs?.favorites.has(ex.id)
			}))
			.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
	}

	return {
		workout: owned.workout,
		program: { ...owned.program, week: weekOf(owned.program.createdAt) },
		active,
		exercises,
		alternatives,
		addable
	};
}

/** Swaps to `targetId` if it fits the slot, or to a random fitting exercise when none is given. */
export async function swapExercise(userId: string, workoutExerciseId: number, targetId?: string) {
	const row = await ownedItem(userId, workoutExerciseId);
	const profile = await getProfile(userId);
	if (!row || !profile) return false;

	const pool = await loadPool();
	const siblings = await db
		.select({ id: workoutExercise.exerciseId })
		.from(workoutExercise)
		.where(eq(workoutExercise.workoutId, row.workoutId));
	const current = pool.find((ex) => ex.id === row.item.exerciseId);
	if (!current) return false;

	const inWorkout = siblings.map((s) => s.id);
	const next = targetId
		? replacementOptions(pool, current, inWorkout, profile).find((ex) => ex.id === targetId)
		: pickReplacement(pool, current, inWorkout, profile);
	if (!next) return false;

	const { exerciseId, sets, repLow, repHigh, unit, perSide, rest, target } = prescribe(
		next,
		row.item.role as Role,
		profile
	);
	await db
		.update(workoutExercise)
		.set({ exerciseId, sets, repLow, repHigh, unit, perSide, rest, target })
		.where(eq(workoutExercise.id, workoutExerciseId));
	return true;
}

// ─── Plan editor ─────────────────────────────────────────────────────────────

/** Adds an exercise to the end of a workout in the active plan. */
export async function addExercise(userId: string, workoutId: number, exerciseId: string) {
	const owned = await ownedWorkout(userId, workoutId);
	const profile = await getProfile(userId);
	if (!owned || owned.program.archivedAt || !profile) return false;
	await ensureCatalog();
	const [ex] = (await db
		.select()
		.from(exercise)
		.where(eq(exercise.id, exerciseId))) as ExerciseDef[];
	if (!ex) return false;

	const [{ max, dup }] = await db
		.select({
			max: sql<number>`coalesce(max(${workoutExercise.position}), -1)::int`,
			dup: sql<number>`count(*) filter (where ${workoutExercise.exerciseId} = ${exerciseId})::int`
		})
		.from(workoutExercise)
		.where(eq(workoutExercise.workoutId, workoutId));
	if (dup) return false;

	await db
		.insert(workoutExercise)
		.values({ ...prescribe(ex, roleFor(ex), profile), workoutId, position: max + 1 });
	return true;
}

/** Removes an exercise from a plan. Sets already logged for it are kept in history. */
export async function removeExercise(userId: string, workoutExerciseId: number) {
	const row = await ownedItem(userId, workoutExerciseId);
	if (!row) return false;
	await db.delete(workoutExercise).where(eq(workoutExercise.id, workoutExerciseId));
	await renumber(row.workoutId);
	return true;
}

/** Moves an exercise one place up (-1) or down (+1). */
export async function moveExercise(userId: string, workoutExerciseId: number, direction: -1 | 1) {
	const row = await ownedItem(userId, workoutExerciseId);
	if (!row) return false;
	const items = await db
		.select({ id: workoutExercise.id })
		.from(workoutExercise)
		.where(eq(workoutExercise.workoutId, row.workoutId))
		.orderBy(asc(workoutExercise.position));
	const from = items.findIndex((i) => i.id === workoutExerciseId);
	const to = from + direction;
	if (to < 0 || to >= items.length) return false;
	[items[from], items[to]] = [items[to], items[from]];
	await renumber(
		row.workoutId,
		items.map((i) => i.id)
	);
	return true;
}

/** Writes positions 0..n in the given order (or the current order, closing gaps). */
async function renumber(workoutId: number, order?: number[]) {
	const ids =
		order ??
		(
			await db
				.select({ id: workoutExercise.id })
				.from(workoutExercise)
				.where(eq(workoutExercise.workoutId, workoutId))
				.orderBy(asc(workoutExercise.position))
		).map((r) => r.id);
	if (!ids.length) return;
	await db
		.update(workoutExercise)
		.set({
			position: sql.raw(
				`case id ${ids.map((id, i) => `when ${Number(id)} then ${i}`).join(' ')} end`
			)
		})
		.where(inArray(workoutExercise.id, ids));
}

/** Changes sets and the rep (or seconds) range for one exercise in the plan. */
export async function updateTarget(
	userId: string,
	workoutExerciseId: number,
	sets: number,
	repLow: number,
	repHigh: number
) {
	const row = await ownedItem(userId, workoutExerciseId);
	if (!row) return false;
	const [ex] = await db
		.select({ unit: exercise.unit, unilateral: exercise.unilateral, pattern: exercise.pattern })
		.from(exercise)
		.where(eq(exercise.id, row.item.exerciseId));
	if (!ex) return false;
	const lo = Math.min(repLow, repHigh);
	const hi = Math.max(repLow, repHigh);
	await db
		.update(workoutExercise)
		.set({
			sets,
			repLow: lo,
			repHigh: hi,
			target: targetText(ex as Pick<ExerciseDef, 'unit' | 'unilateral' | 'pattern'>, sets, lo, hi)
		})
		.where(eq(workoutExercise.id, workoutExerciseId));
	return true;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Resumes an unfinished session for this workout from the last 12 hours, or starts a new one. */
export async function startSession(userId: string, workoutId: number) {
	if (!(await ownedWorkout(userId, workoutId))) return null;
	const [open] = await db
		.select({ id: workoutSession.id })
		.from(workoutSession)
		.where(
			and(
				eq(workoutSession.userId, userId),
				eq(workoutSession.workoutId, workoutId),
				isNull(workoutSession.completedAt),
				sql`${workoutSession.startedAt} > now() - interval '12 hours'`
			)
		)
		.limit(1);
	if (open) return open.id;
	const [created] = await db
		.insert(workoutSession)
		.values({ userId, workoutId })
		.returning({ id: workoutSession.id });
	return created.id;
}

type LoggedSet = { weight: number | null; reps: number | null };

export async function getSession(userId: string, sessionId: number) {
	const [row] = await db
		.select()
		.from(workoutSession)
		.where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
	if (!row) return null;

	const owned = await ownedWorkout(userId, row.workoutId);
	const profile = await getProfile(userId);
	if (!owned || !profile) return null;
	const items = await workoutExercises(row.workoutId);
	const logs = await db
		.select()
		.from(setLog)
		.where(eq(setLog.sessionId, sessionId))
		.orderBy(asc(setLog.setNumber));

	// Every earlier finished set of these exercises: "last time", next weight and personal records.
	const exerciseIds = [
		...new Set([...items.map((i) => i.exercise.id), ...logs.map((l) => l.exerciseId)])
	];
	const history = exerciseIds.length
		? await db
				.select({
					exerciseId: setLog.exerciseId,
					setNumber: setLog.setNumber,
					weight: setLog.weight,
					reps: setLog.reps,
					startedAt: workoutSession.startedAt
				})
				.from(setLog)
				.innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
				.where(
					and(
						eq(workoutSession.userId, userId),
						ne(setLog.sessionId, sessionId),
						isNotNull(workoutSession.completedAt),
						lt(workoutSession.startedAt, row.startedAt),
						inArray(setLog.exerciseId, exerciseIds)
					)
				)
				.orderBy(desc(workoutSession.startedAt), asc(setLog.setNumber))
		: [];

	const previous: Record<string, { date: Date; sets: LoggedSet[] }> = {};
	const bestBefore: Record<string, number> = {};
	for (const h of history) {
		previous[h.exerciseId] ??= { date: h.startedAt, sets: [] };
		const latest = previous[h.exerciseId];
		if (latest.date.getTime() === h.startedAt.getTime())
			latest.sets.push({ weight: h.weight, reps: h.reps });
		bestBefore[h.exerciseId] = Math.max(
			bestBefore[h.exerciseId] ?? 0,
			estimatedMax(h.weight, h.reps)
		);
	}

	const plan = planWeek(owned.program, profile.age);

	return {
		session: row,
		workout: owned.workout,
		program: { ...owned.program, ...plan },
		deload: plan.deload && owned.workout.kind !== 'mobility',
		increment: profile.weightIncrement ?? DEFAULT_INCREMENT,
		items,
		logs,
		previous,
		summary: row.completedAt ? await summarize(userId, row, logs, items, bestBefore) : null
	};
}

/** The end-of-workout recap: time, work done, personal records and the change since last time. */
async function summarize(
	userId: string,
	session: typeof workoutSession.$inferSelect,
	logs: (typeof setLog.$inferSelect)[],
	items: Awaited<ReturnType<typeof workoutExercises>>,
	bestBefore: Record<string, number>
) {
	const names = new Map(items.map((i) => [i.exercise.id, i.exercise.name]));
	const missing = logs.map((l) => l.exerciseId).filter((id) => !names.has(id));
	if (missing.length) {
		for (const r of await db
			.select({ id: exercise.id, name: exercise.name })
			.from(exercise)
			.where(inArray(exercise.id, missing)))
			names.set(r.id, r.name);
	}

	const records: { name: string; weight: number | null; reps: number | null }[] = [];
	for (const id of new Set(logs.map((l) => l.exerciseId))) {
		const sets = logs.filter((l) => l.exerciseId === id);
		const top = sets.reduce((a, b) =>
			estimatedMax(b.weight, b.reps) > estimatedMax(a.weight, a.reps) ? b : a
		);
		// Only a record if there was something to beat.
		if (id in bestBefore && estimatedMax(top.weight, top.reps) > bestBefore[id]) {
			records.push({ name: names.get(id) ?? id, weight: top.weight, reps: top.reps });
		}
	}

	// The last finished session of the same workout, to compare against.
	const [last] = await db
		.select({ id: workoutSession.id })
		.from(workoutSession)
		.where(
			and(
				eq(workoutSession.userId, userId),
				eq(workoutSession.workoutId, session.workoutId),
				isNotNull(workoutSession.completedAt),
				lt(workoutSession.startedAt, session.startedAt)
			)
		)
		.orderBy(desc(workoutSession.startedAt))
		.limit(1);
	const lastLogs = last
		? await db
				.select({ weight: setLog.weight, reps: setLog.reps })
				.from(setLog)
				.where(eq(setLog.sessionId, last.id))
		: null;

	return {
		minutes: Math.max(
			1,
			Math.round((session.completedAt!.getTime() - session.startedAt.getTime()) / 60000)
		),
		sets: logs.length,
		volume: volume(logs),
		records,
		lastVolume: lastLogs ? volume(lastLogs) : null,
		lastSets: lastLogs?.length ?? null
	};
}

export async function logSet(
	userId: string,
	sessionId: number,
	workoutExerciseId: number,
	setNumber: number,
	weight: number | null,
	reps: number | null
) {
	const [owned] = await db
		.select({ exerciseId: workoutExercise.exerciseId })
		.from(workoutSession)
		.innerJoin(workoutExercise, eq(workoutExercise.workoutId, workoutSession.workoutId))
		.where(
			and(
				eq(workoutSession.id, sessionId),
				eq(workoutSession.userId, userId),
				eq(workoutExercise.id, workoutExerciseId)
			)
		);
	if (!owned) return false;
	await db
		.insert(setLog)
		.values({ sessionId, workoutExerciseId, exerciseId: owned.exerciseId, setNumber, weight, reps })
		.onConflictDoUpdate({
			target: [setLog.sessionId, setLog.workoutExerciseId, setLog.setNumber],
			set: { weight, reps, loggedAt: new Date() }
		});
	return true;
}

export async function clearSet(
	userId: string,
	sessionId: number,
	workoutExerciseId: number,
	setNumber: number
) {
	const [owned] = await db
		.select({ id: workoutSession.id })
		.from(workoutSession)
		.where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
	if (!owned) return;
	await db
		.delete(setLog)
		.where(
			and(
				eq(setLog.sessionId, sessionId),
				eq(setLog.workoutExerciseId, workoutExerciseId),
				eq(setLog.setNumber, setNumber)
			)
		);
}

export async function finishSession(
	userId: string,
	sessionId: number,
	bodyWeight: number | null,
	notes: string | null
) {
	await db
		.update(workoutSession)
		.set({ completedAt: new Date(), bodyWeight, notes })
		.where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
}

export async function discardSession(userId: string, sessionId: number) {
	await db
		.delete(workoutSession)
		.where(
			and(
				eq(workoutSession.id, sessionId),
				eq(workoutSession.userId, userId),
				isNull(workoutSession.completedAt)
			)
		);
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface ProgressPoint {
	date: Date;
	weight: number | null;
	reps: number | null;
	best: number;
	volume: number;
	record: boolean;
}

/** Per exercise, the best set of each finished session, oldest first; plus body weight. */
export async function getProgress(userId: string) {
	const rows = await db
		.select({
			sessionId: setLog.sessionId,
			exerciseId: setLog.exerciseId,
			name: exercise.name,
			unit: exercise.unit,
			pattern: exercise.pattern,
			weight: setLog.weight,
			reps: setLog.reps,
			date: workoutSession.startedAt
		})
		.from(setLog)
		.innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
		.innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
		.where(and(eq(workoutSession.userId, userId), isNotNull(workoutSession.completedAt)))
		.orderBy(asc(workoutSession.startedAt));

	const byExercise = new Map<
		string,
		{ id: string; name: string; unit: string; pattern: string; sessions: Map<number, typeof rows> }
	>();
	for (const r of rows) {
		const entry = byExercise.get(r.exerciseId) ?? {
			id: r.exerciseId,
			name: r.name,
			unit: r.unit,
			pattern: r.pattern,
			sessions: new Map()
		};
		entry.sessions.set(r.sessionId, [...(entry.sessions.get(r.sessionId) ?? []), r]);
		byExercise.set(r.exerciseId, entry);
	}

	const exercises = [...byExercise.values()].map((e) => {
		let runningBest = 0;
		const points: ProgressPoint[] = [...e.sessions.values()].map((sets) => {
			const top = sets.reduce((a, b) =>
				estimatedMax(b.weight, b.reps) > estimatedMax(a.weight, a.reps) ? b : a
			);
			const best = estimatedMax(top.weight, top.reps);
			const record = runningBest > 0 && best > runningBest;
			runningBest = Math.max(runningBest, best);
			return {
				date: top.date,
				weight: top.weight,
				reps: top.reps,
				best,
				volume: volume(sets),
				record
			};
		});
		return { id: e.id, name: e.name, unit: e.unit, pattern: e.pattern, points };
	});
	exercises.sort((a, b) => b.points.at(-1)!.date.getTime() - a.points.at(-1)!.date.getTime());

	const bodyWeight = await db
		.select({ date: workoutSession.completedAt, weight: workoutSession.bodyWeight })
		.from(workoutSession)
		.where(and(eq(workoutSession.userId, userId), isNotNull(workoutSession.bodyWeight)))
		.orderBy(asc(workoutSession.completedAt));

	return {
		exercises,
		bodyWeight: bodyWeight.map((b) => ({ date: b.date!, weight: b.weight! }))
	};
}

// ─── Exercise library ────────────────────────────────────────────────────────

export async function searchExercises(opts: {
	q?: string;
	pattern?: string;
	source?: string;
	equipment?: string[];
	ids?: string[];
	excludeIds?: string[];
	limit?: number;
}) {
	await ensureCatalog();
	const where = [];
	if (opts.q) where.push(sql`${exercise.name} ilike ${'%' + opts.q + '%'}`);
	if (opts.pattern) where.push(eq(exercise.pattern, opts.pattern));
	if (opts.source) where.push(eq(exercise.source, opts.source));
	if (opts.ids) where.push(opts.ids.length ? inArray(exercise.id, opts.ids) : sql`false`);
	if (opts.excludeIds?.length) where.push(notInArray(exercise.id, opts.excludeIds));
	if (opts.equipment) {
		// No equipment means bodyweight only; arrayContained rejects an empty list.
		where.push(
			opts.equipment.length
				? arrayContained(exercise.equipment, opts.equipment)
				: sql`cardinality(${exercise.equipment}) = 0`
		);
	}
	const rows = await db
		.select()
		.from(exercise)
		.where(where.length ? and(...where) : undefined)
		.orderBy(asc(exercise.name))
		.limit(opts.limit ?? 120);
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(exercise)
		.where(where.length ? and(...where) : undefined);
	return { rows: rows as ExerciseDef[], total: count };
}

export async function exerciseSourceCounts() {
	return db
		.select({ source: exercise.source, count: sql<number>`count(*)::int` })
		.from(exercise)
		.groupBy(exercise.source);
}
