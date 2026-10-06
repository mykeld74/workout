import {
	pgTable,
	serial,
	integer,
	text,
	boolean,
	real,
	timestamp,
	date,
	jsonb,
	index,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import type { Guidelines } from '../../workout/types.ts';

export const exercise = pgTable(
	'exercise',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		category: text('category').notNull(),
		pattern: text('pattern').notNull(),
		focus: text('focus'),
		muscles: text('muscles').array().notNull().default([]),
		equipment: text('equipment').array().notNull().default([]),
		level: text('level').notNull().default('beginner'),
		jointStress: text('joint_stress').notNull().default('low'),
		unilateral: boolean('unilateral').notNull().default(false),
		unit: text('unit').notNull().default('reps'),
		defaultSets: integer('default_sets'),
		repLow: integer('rep_low'),
		repHigh: integer('rep_high'),
		targetLabel: text('target_label'),
		cues: text('cues').array().notNull().default([]),
		instructions: text('instructions').array().notNull().default([]),
		images: text('images').array().notNull().default([]),
		imagesApprox: boolean('images_approx').notNull().default(false),
		source: text('source').notNull()
	},
	(t) => [index('exercise_pattern_idx').on(t.pattern)]
);

export const profile = pgTable('profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	birthDate: date('birth_date', { mode: 'string' }).notNull(),
	equipment: text('equipment').array().notNull(),
	experience: text('experience').notNull().default('returning'),
	powerblock: boolean('powerblock').notNull().default(false),
	weightIncrement: real('weight_increment').notNull().default(5),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

/** A block of workouts. "Switch it up" archives the active one and generates a new one. */
export const program = pgTable(
	'program',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		guidelines: jsonb('guidelines').$type<Guidelines>().notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		archivedAt: timestamp('archived_at')
	},
	(t) => [index('program_user_idx').on(t.userId)]
);

export const workout = pgTable(
	'workout',
	{
		id: serial('id').primaryKey(),
		programId: integer('program_id')
			.notNull()
			.references(() => program.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		variant: text('variant').notNull(),
		title: text('title').notNull(),
		focus: text('focus').notNull(),
		warmup: text('warmup').notNull(),
		position: integer('position').notNull()
	},
	(t) => [index('workout_program_idx').on(t.programId)]
);

export const workoutExercise = pgTable(
	'workout_exercise',
	{
		id: serial('id').primaryKey(),
		workoutId: integer('workout_id')
			.notNull()
			.references(() => workout.id, { onDelete: 'cascade' }),
		exerciseId: text('exercise_id')
			.notNull()
			.references(() => exercise.id),
		position: integer('position').notNull(),
		role: text('role').notNull(),
		sets: integer('sets').notNull(),
		repLow: integer('rep_low'),
		repHigh: integer('rep_high'),
		unit: text('unit').notNull(),
		perSide: boolean('per_side').notNull(),
		rest: text('rest').notNull(),
		target: text('target').notNull()
	},
	(t) => [index('workout_exercise_workout_idx').on(t.workoutId)]
);

export const workoutSession = pgTable(
	'workout_session',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workoutId: integer('workout_id')
			.notNull()
			.references(() => workout.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at').defaultNow().notNull(),
		completedAt: timestamp('completed_at'),
		bodyWeight: real('body_weight'),
		notes: text('notes')
	},
	(t) => [index('workout_session_user_idx').on(t.userId)]
);

export const setLog = pgTable(
	'set_log',
	{
		id: serial('id').primaryKey(),
		sessionId: integer('session_id')
			.notNull()
			.references(() => workoutSession.id, { onDelete: 'cascade' }),
		// Kept when an exercise is removed from a plan, so its history survives.
		workoutExerciseId: integer('workout_exercise_id').references(() => workoutExercise.id, {
			onDelete: 'set null'
		}),
		exerciseId: text('exercise_id').notNull(),
		setNumber: integer('set_number').notNull(),
		weight: real('weight'),
		reps: integer('reps'),
		loggedAt: timestamp('logged_at').defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('set_log_unique').on(t.sessionId, t.workoutExerciseId, t.setNumber),
		index('set_log_exercise_idx').on(t.exerciseId)
	]
);

/** Exercises a user starred (picked more often) or hid (never picked). */
export const exercisePref = pgTable(
	'exercise_pref',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		exerciseId: text('exercise_id')
			.notNull()
			.references(() => exercise.id, { onDelete: 'cascade' }),
		status: text('status').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.exerciseId] })]
);

/** One key per user for the phone app that sends Health Connect data. Only a hash is stored. */
export const healthKey = pgTable('health_key', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	keyHash: text('key_hash').notNull().unique(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	lastUsedAt: timestamp('last_used_at')
});

/**
 * Readings from Samsung Health via Health Connect: one row per reading or interval.
 * `value` is in the metric's base unit (bpm, ms, kg, steps, meters, kcal, seconds for exercise).
 */
export const healthSample = pgTable(
	'health_sample',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		metric: text('metric').notNull(),
		startTime: timestamp('start_time').notNull(),
		endTime: timestamp('end_time'),
		value: real('value').notNull(),
		detail: jsonb('detail').$type<Record<string, unknown>>(),
		receivedAt: timestamp('received_at').defaultNow().notNull()
	},
	(t) => [
		// The phone resends overlapping windows; this keeps one row per reading.
		uniqueIndex('health_sample_unique').on(t.userId, t.metric, t.startTime)
	]
);

export * from './auth.schema';
