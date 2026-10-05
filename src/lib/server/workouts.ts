import {
	and,
	arrayContained,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	ne,
	sql
} from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	exercise,
	profile as profileTable,
	program,
	setLog,
	workout,
	workoutExercise,
	workoutSession
} from '#lib/server/db/schema.ts';
import { CATALOG } from '#lib/workout/catalog.ts';
import {
	generateProgram,
	pickReplacement,
	prescribe,
	replacementOptions
} from '#lib/workout/generator.ts';
import {
	ageFromBirthDate,
	type Equipment,
	type ExerciseDef,
	type Experience,
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

export async function getProfile(userId: string): Promise<StoredProfile | undefined> {
	const [row] = await db.select().from(profileTable).where(eq(profileTable.userId, userId));
	if (!row) return undefined;
	return {
		birthDate: row.birthDate,
		age: ageFromBirthDate(row.birthDate),
		equipment: row.equipment as Equipment[],
		experience: row.experience as Experience
	};
}

export async function saveProfile(
	userId: string,
	p: { birthDate: string; equipment: Equipment[]; experience: Experience }
) {
	await db
		.insert(profileTable)
		.values({ userId, ...p })
		.onConflictDoUpdate({
			target: profileTable.userId,
			set: { ...p, updatedAt: new Date() }
		});
}

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

/** Archives the current plan (if any) and generates a fresh one that avoids its exercises. */
export async function createProgram(userId: string, profile: Profile) {
	const pool = await loadPool();
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

	const plan = generateProgram({ profile, pool, previousIds, useSheets: pastPrograms === 0 });

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
		program: { ...active, week: weekOf(active.createdAt) },
		workouts: workouts.map((w) => ({
			...w,
			exerciseCount: counts.find((c) => c.workoutId === w.id)?.count ?? 0,
			timesDone: doneCount.get(w.id) ?? 0
		})),
		nextStrength: nextOf('strength'),
		nextMobility: nextOf('mobility'),
		inProgress: sessions.find((s) => !s.completedAt) ?? null,
		recent: sessions.filter((s) => s.completedAt).slice(0, 6)
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

	// What each slot could be swapped to, for the swap menu.
	const alternatives: Record<number, { id: string; name: string; source: string }[]> = {};
	const profile = active ? await getProfile(userId) : undefined;
	if (profile) {
		const pool = await loadPool();
		const inWorkout = exercises.map((e) => e.exercise.id);
		for (const { item, exercise: current } of exercises) {
			alternatives[item.id] = replacementOptions(pool, current as ExerciseDef, inWorkout, profile)
				.slice(0, 40)
				.map(({ id, name, source }) => ({ id, name, source }));
		}
	}

	return {
		workout: owned.workout,
		program: { ...owned.program, week: weekOf(owned.program.createdAt) },
		active,
		exercises,
		alternatives
	};
}

/** Swaps to `targetId` if it fits the slot, or to a random fitting exercise when none is given. */
export async function swapExercise(userId: string, workoutExerciseId: number, targetId?: string) {
	const [row] = await db
		.select({ item: workoutExercise, workoutId: workout.id })
		.from(workoutExercise)
		.innerJoin(workout, eq(workout.id, workoutExercise.workoutId))
		.innerJoin(program, eq(program.id, workout.programId))
		.where(and(eq(workoutExercise.id, workoutExerciseId), eq(program.userId, userId)));
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

export async function getSession(userId: string, sessionId: number) {
	const [row] = await db
		.select()
		.from(workoutSession)
		.where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
	if (!row) return null;

	const owned = await ownedWorkout(userId, row.workoutId);
	if (!owned) return null;
	const items = await workoutExercises(row.workoutId);
	const logs = await db
		.select()
		.from(setLog)
		.where(eq(setLog.sessionId, sessionId))
		.orderBy(asc(setLog.setNumber));

	// The most recent earlier session that logged each exercise, for "last time" and progression hints.
	const exerciseIds = items.map((i) => i.exercise.id);
	const history = exerciseIds.length
		? await db
				.select({
					exerciseId: setLog.exerciseId,
					sessionId: setLog.sessionId,
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
						inArray(setLog.exerciseId, exerciseIds)
					)
				)
				.orderBy(desc(workoutSession.startedAt), asc(setLog.setNumber))
				.limit(400)
		: [];

	const previous: Record<
		string,
		{ date: Date; sets: { weight: number | null; reps: number | null }[] }
	> = {};
	for (const h of history) {
		previous[h.exerciseId] ??= { date: h.startedAt, sets: [] };
		const latest = previous[h.exerciseId];
		if (latest.date.getTime() === h.startedAt.getTime())
			latest.sets.push({ weight: h.weight, reps: h.reps });
	}

	return {
		session: row,
		workout: owned.workout,
		program: { ...owned.program, week: weekOf(owned.program.createdAt) },
		items,
		logs,
		previous
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

export async function searchExercises(opts: {
	q?: string;
	pattern?: string;
	source?: string;
	equipment?: string[];
	limit?: number;
}) {
	await ensureCatalog();
	const where = [];
	if (opts.q) where.push(sql`${exercise.name} ilike ${'%' + opts.q + '%'}`);
	if (opts.pattern) where.push(eq(exercise.pattern, opts.pattern));
	if (opts.source) where.push(eq(exercise.source, opts.source));
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
