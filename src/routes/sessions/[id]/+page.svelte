<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import Countdown from '#lib/components/Countdown.svelte';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ReadinessNote from '#lib/components/ReadinessNote.svelte';
	import { unlockAudio } from '#lib/alert-sound.ts';
	import { addPending, flushPending, readPending, type PendingSet } from '#lib/offline-sets.ts';
	import { deloadWeight, nextWeight } from '#lib/workout/progression.ts';
	import { exerciseName } from '#lib/workout/week.ts';
	import { keepScreenOn } from '#lib/wake-lock.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const LOADABLE = [
		'dumbbell',
		'barbell',
		'kettlebell',
		'cable',
		'machine',
		'ez_bar',
		'medicine_ball'
	];

	const kind = $derived(data.workout.kind);
	const finished = $derived(!!data.session.completedAt);

	// Keep the phone awake between sets until the workout is finished.
	$effect(() => {
		if (!finished) return keepScreenOn();
	});

	type Log = { weight: number | null; reps: number | null; pending?: boolean };

	// Sets saved on this phone because the connection dropped; sent when it's back.
	let pending = $state<PendingSet[]>([]);
	let syncing = $state(false);

	async function sync() {
		if (syncing) return;
		syncing = true;
		const before = pending.length;
		await flushPending(data.session.id);
		pending = readPending().filter((p) => p.sessionId === data.session.id);
		syncing = false;
		if (pending.length < before) await invalidateAll();
	}

	// Load sets left on this phone and keep retrying. Only re-runs if the session changes;
	// `untrack` stops it re-running every time `pending` changes (which it updates itself).
	$effect(() => {
		const sessionId = data.session.id;
		untrack(() => {
			pending = readPending().filter((p) => p.sessionId === sessionId);
			if (pending.length) void sync();
		});
		const retry = () => untrack(() => pending.length && void sync());
		window.addEventListener('online', retry);
		const id = setInterval(retry, 20_000);
		return () => {
			window.removeEventListener('online', retry);
			clearInterval(id);
		};
	});

	// Sets saved during this visit. Shown straight away instead of reloading the whole page
	// after every Done (each reload is several round-trips to the database).
	let saved = $state<Record<string, Log>>({});
	const setKey = (workoutExerciseId: number, setNumber: number) =>
		`${workoutExerciseId}:${setNumber}`;
	$effect.pre(() => {
		void data.session.id;
		saved = {};
	});

	/** Logged sets keyed by workout exercise, then set number, including ones waiting to sync. */
	const logsByItem = $derived.by(() => {
		const byItem: Record<number, Record<number, Log>> = {};
		for (const log of data.logs) {
			if (log.workoutExerciseId === null) continue;
			byItem[log.workoutExerciseId] ??= {};
			byItem[log.workoutExerciseId][log.setNumber] = log;
		}
		for (const [key, log] of Object.entries(saved)) {
			const [id, n] = key.split(':').map(Number);
			byItem[id] ??= {};
			byItem[id][n] = log;
		}
		for (const p of pending) {
			byItem[p.workoutExerciseId] ??= {};
			byItem[p.workoutExerciseId][p.setNumber] = { ...p, pending: true };
		}
		return byItem;
	});

	type Item = (typeof data.items)[number]['item'];

	/** The plan's sets for today. Lighter week: 2 sets on lifts. */
	function plannedSets(it: Item) {
		return data.deload && it.role !== 'core' && it.role !== 'stretch'
			? Math.min(2, it.sets)
			: it.sets;
	}

	// Sets added during this workout ("Add a set"), per exercise. Not saved to the plan.
	const MAX_SETS = 10;
	let extraSets = $state<Record<number, number>>({});
	/** Sets added (and saved to the plan) during this visit; only these can be removed again. */
	let added = $state<Record<number, number>>({});
	let planNote = $state<string | null>(null);

	/** Highest set number logged so far (covers extra sets from before a reload). */
	function lastLogged(itemId: number) {
		return Math.max(0, ...Object.keys(logsByItem[itemId] ?? {}).map(Number));
	}

	/** Sets shown for an exercise: the plan's, plus any added, and never fewer than logged. */
	function setsFor(it: Item) {
		return Math.min(
			MAX_SETS,
			Math.max(plannedSets(it) + (extraSets[it.id] ?? 0), lastLogged(it.id))
		);
	}

	function doneCount(itemId: number) {
		return Object.keys(logsByItem[itemId] ?? {}).length;
	}

	/** The first exercise that still has sets left (the last one if all are done). */
	function firstOpen() {
		const first = data.items.findIndex(({ item }) => doneCount(item.id) < setsFor(item));
		return first === -1 ? data.items.length - 1 : first;
	}

	// Worked out once, the same on the server and in the browser, so the first render matches.
	let index = $state(firstOpen());

	const current = $derived(data.items[index]);
	const item = $derived(current.item);
	const ex = $derived(current.exercise);
	const sets = $derived(setsFor(item));
	const logs = $derived(logsByItem[item.id] ?? {});
	/** The plan's target with this workout's set count, e.g. "3 × 10–12" after adding a set. */
	const shownTarget = $derived.by(() => {
		const planned = item.sets + (added[item.id] ?? 0);
		const rest = item.target.replace(/^\d+ × /, '');
		return planned === 1 ? rest : `${planned} × ${rest}`;
	});
	const previous = $derived(data.previous[ex.id]);
	const weighted = $derived(ex.equipment.some((e) => LOADABLE.includes(e)));
	const unitLabel = $derived(item.unit === 'seconds' ? 'sec' : 'reps');
	/** The first set of this exercise that isn't logged yet (null when all are). */
	const currentSet = $derived.by(() => {
		for (let n = 1; n <= sets; n++) if (!logs[n]) return n;
		return null;
	});

	const allDone = $derived(data.items.every(({ item }) => doneCount(item.id) >= setsFor(item)));

	/** Heaviest weight used last time on this exercise. */
	const lastWeight = $derived(
		Math.max(0, ...(previous?.sets.map((s) => s.weight ?? 0) ?? [])) || null
	);

	/** "Hit the top of the range on every set → next dumbbell up", with the actual weight. */
	const hitTop = $derived(
		!!previous &&
			item.repHigh !== null &&
			item.unit === 'reps' &&
			previous.sets.length >= item.sets &&
			previous.sets.every((s) => (s.reps ?? 0) >= item.repHigh!)
	);

	/** What to load today: lighter on a deload, one step up after hitting the top, else same. */
	const suggested = $derived.by(() => {
		if (!weighted || !lastWeight) return null;
		if (data.deload) return deloadWeight(lastWeight, data.increment);
		if (hitTop) return nextWeight(lastWeight, data.increment);
		return null;
	});

	const progressHint = $derived.by(() => {
		if (data.deload) {
			return suggested
				? `Lighter week: about ${suggested} lb, easy reps.`
				: 'Lighter week: keep it easy, stop well short of failure.';
		}
		if (!hitTop) return null;
		return suggested
			? `You hit the top of the range every set last time. Go up to ${suggested} lb.`
			: 'You hit the top of the range last time. Slow the lowering or add a pause.';
	});

	/** The latest logged set before this one, so every remaining set starts from what you just did. */
	function lastBefore(setNumber: number) {
		for (let n = setNumber - 1; n >= 1; n--) if (logs[n]) return logs[n];
		return undefined;
	}

	function defaultWeight(setNumber: number): number | string {
		const logged = logs[setNumber]?.weight ?? lastBefore(setNumber)?.weight;
		if (logged != null) return logged;
		if (suggested) return suggested;
		return previous?.sets[setNumber - 1]?.weight ?? previous?.sets[0]?.weight ?? '';
	}

	/** Reps (or seconds) to start a set with: your latest logged set, else the top of the range. */
	function defaultReps(setNumber: number): number | string {
		return logs[setNumber]?.reps ?? lastBefore(setNumber)?.reps ?? item.repHigh ?? '';
	}

	/** The low end of the rest range: "90–120s" → 90, "60s" → 60. Null when there's no rest (stretches). */
	function minRestSeconds(rest: string): number | null {
		const first = Number(rest.match(/\d+/)?.[0]);
		return Number.isFinite(first) && first > 0 ? first : null;
	}

	let timer = $state<{ label: string; seconds: number; key: number } | null>(null);

	function go(to: number) {
		index = Math.max(0, Math.min(data.items.length - 1, to));
		timer = null;
		window.scrollTo({ top: 0 });
	}

	function fmtSet(s: { weight: number | null; reps: number | null }) {
		const w = s.weight != null ? `${s.weight}` : '';
		const r = s.reps != null ? `${s.reps}` : '–';
		return w ? `${w}×${r}` : r;
	}

	let confirmDiscard = $state(false);
	let finishBlocked = $state(false);
	const summary = $derived(data.summary);
	const volumeChange = $derived(
		summary && summary.lastVolume ? summary.volume - summary.lastVolume : null
	);
	const fmtLb = (n: number) => `${Math.round(n).toLocaleString()} lb`;
</script>

<article class="kind-{kind}">
	<header>
		<a class="back" href="/workouts/{data.workout.id}"
			><Icon name="chevronLeft" size={20} />{data.workout.title}</a
		>
		<span class="count">{index + 1} / {data.items.length}</span>
	</header>

	{#if summary}
		<section class="summary card" aria-labelledby="summary-title">
			<h2 id="summary-title">Workout done</h2>
			<dl class="stats">
				<div>
					<dt>Time</dt>
					<dd>{summary.minutes} min</dd>
				</div>
				<div>
					<dt>Sets</dt>
					<dd>{summary.sets}</dd>
				</div>
				<div>
					<dt>Weight moved</dt>
					<dd>{fmtLb(summary.volume)}</dd>
				</div>
				{#if data.vitals?.avgHr}
					<div>
						<dt>Avg heart rate</dt>
						<dd>{data.vitals.avgHr} bpm</dd>
					</div>
				{/if}
				{#if data.vitals?.maxHr}
					<div>
						<dt>Peak heart rate</dt>
						<dd>{data.vitals.maxHr} bpm</dd>
					</div>
				{/if}
				{#if data.vitals?.calories}
					<div>
						<dt>Calories</dt>
						<dd>{data.vitals.calories}</dd>
					</div>
				{/if}
			</dl>
			{#if data.vitals}
				<p class="muted watch-note">
					From your Galaxy Watch{data.vitals.watchMinutes
						? ` (${exerciseName(data.vitals.watchType)} session, ${data.vitals.watchMinutes} min)`
						: ''}.
				</p>
			{/if}
			{#if volumeChange !== null}
				<p class="compare">
					{volumeChange >= 0 ? 'Up' : 'Down'}
					{fmtLb(Math.abs(volumeChange))} from last {data.workout.title}
					{#if summary.lastSets !== null && summary.lastSets !== summary.sets}
						<span class="muted">({summary.lastSets} sets last time)</span>
					{/if}
				</p>
			{/if}
			{#if summary.records.length}
				<h3>New personal records</h3>
				<ul class="records">
					{#each summary.records as r (r.name)}
						<li>
							<strong>{r.name}</strong>
							<span>{r.weight != null ? `${r.weight} lb × ` : ''}{r.reps}</span>
						</li>
					{/each}
				</ul>
			{/if}
			<a class="btn" href="/">Back to plan</a>
		</section>
	{/if}

	<ReadinessNote readiness={data.readiness} onlyWhenEasy />

	{#if data.deload && !finished}
		<p class="banner" role="note">
			<strong>Lighter week.</strong> 2 sets per lift at about 60% of your usual weight. Recovery is part
			of getting stronger.
		</p>
	{/if}

	{#if pending.length}
		<p class="banner offline" role="status">
			{pending.length} set{pending.length === 1 ? '' : 's'} saved on this phone — will send when you're
			back online.
			<button type="button" class="btn ghost small" onclick={sync} disabled={syncing}>
				{syncing ? 'Sending…' : 'Try now'}
			</button>
		</p>
	{/if}

	<nav class="strip" aria-label="Exercises">
		{#each data.items as { item: it, exercise: e }, i (it.id)}
			<button
				type="button"
				class="pip"
				class:current={i === index}
				class:complete={doneCount(it.id) >= setsFor(it)}
				aria-label="{i + 1}. {e.name}{doneCount(it.id) >= setsFor(it) ? ' (done)' : ''}"
				aria-current={i === index ? 'step' : undefined}
				onclick={() => go(i)}
			></button>
		{/each}
	</nav>

	<section class="exercise">
		<h1>{ex.name}</h1>
		<p class="target">
			{shownTarget}{#if plannedSets(item) < item.sets}<span class="muted">
					→ {plannedSets(item)} sets this week</span
				>{/if}
			{#if item.rest !== '—'}<span class="muted">&nbsp;· rest {item.rest}</span>{/if}
		</p>

		{#if previous}
			<p class="last">
				<strong>Last time:</strong>
				{previous.sets.map(fmtSet).join(', ')}{weighted ? ' (lb × reps)' : ''}
			</p>
		{/if}
		{#if progressHint}<p class="hint">{progressHint}</p>{/if}
	</section>

	<p class="set-progress" aria-live="polite">
		{#if currentSet}
			<strong>Set {currentSet}</strong> <span>of {sets}</span>
		{:else}
			<strong class="all-done"><Icon name="check" size={26} />All {sets} sets done</strong>
		{/if}
	</p>

	<ol class="sets">
		{#each Array.from({ length: sets }, (_, i) => i + 1) as setNumber (setNumber)}
			{@const logged = logs[setNumber]}
			<li class:logged>
				<form
					method="post"
					action="?/log"
					use:enhance={({ formData, cancel }) => {
						unlockAudio(); // the tap lets the rest timer beep later
						// Start resting the moment Done is tapped, not after the save round-trip.
						// Updating an already-logged set doesn't restart it.
						const rest = logged ? null : minRestSeconds(item.rest);
						const asPending = (): PendingSet => ({
							sessionId: data.session.id,
							workoutExerciseId: item.id,
							setNumber,
							weight: formData.get('weight') ? Number(formData.get('weight')) : null,
							reps: formData.get('reps') ? Math.round(Number(formData.get('reps'))) : null
						});
						if (!navigator.onLine) {
							// Clearly offline: keep it on the phone without trying.
							cancel();
							addPending(asPending());
							pending = readPending().filter((p) => p.sessionId === data.session.id);
							if (rest) timer = { label: 'Rest', seconds: rest, key: Date.now() };
							return;
						}
						// Show it as logged now; the save finishes in the background.
						const key = setKey(item.id, setNumber);
						const before = saved[key];
						const entered = asPending();
						saved[key] = { weight: entered.weight, reps: entered.reps };
						let started: number | null = null;
						if (rest) {
							started = Date.now();
							timer = {
								label: setNumber >= sets ? 'Rest, then next exercise' : 'Rest',
								seconds: rest,
								key: started
							};
						}
						return async ({ result, update }) => {
							// No response at all (signal dropped): keep the set on the phone and carry on.
							if (result.type === 'error' && result.status === undefined) {
								addPending(asPending());
								pending = readPending().filter((p) => p.sessionId === data.session.id);
								return;
							}
							if (result.type !== 'success') {
								// The set didn't save: undo the early display and the timer we started.
								if (before) saved[key] = before;
								else delete saved[key];
								if (started !== null && timer?.key === started) timer = null;
							}
							// Saved: nothing else on the page changed, so don't reload it all.
							await update({ reset: false, refreshAll: false });
						};
					}}
				>
					<input type="hidden" name="workoutExerciseId" value={item.id} />
					<input type="hidden" name="setNumber" value={setNumber} />
					<span class="set-label" class:next={setNumber === currentSet}>
						{#if logged}<Icon
								name="check"
								size={18}
								label="Set {setNumber} logged"
							/>{:else}{setNumber}{/if}
					</span>
					{#if weighted}
						<label>
							<span class="sr-only">Set {setNumber} weight in pounds</span>
							<input
								name="weight"
								type="number"
								inputmode="decimal"
								step="any"
								min="0"
								placeholder="lb"
								value={logged?.weight ?? defaultWeight(setNumber)}
							/>
						</label>
					{/if}
					<label>
						<span class="sr-only">Set {setNumber} {unitLabel}</span>
						<input
							name="reps"
							type="number"
							inputmode="numeric"
							min="0"
							placeholder={unitLabel}
							value={defaultReps(setNumber)}
						/>
					</label>
					<button class="btn small" class:ghost={!!logged} disabled={finished}>
						{logged ? 'Update' : 'Done'}
					</button>
				</form>
				{#if logged?.pending}<p class="pending-note">Saved on phone · not sent yet</p>{/if}
				{#if item.unit === 'seconds' && !logged}
					<button
						type="button"
						class="hold btn ghost small"
						onclick={() => {
							unlockAudio();
							timer = { label: 'Hold', seconds: item.repLow ?? 30, key: Date.now() };
						}}
					>
						Start {item.repLow ?? 30}s hold
					</button>
				{/if}
			</li>
		{/each}
	</ol>
	{#if !finished}
		<!-- Adding or removing a set here also updates the plan, so next time it's there too. -->
		<form
			class="set-tools"
			method="post"
			action="?/sets"
			use:enhance={({ formData }) => {
				const id = item.id;
				const delta = formData.get('delta') === '-1' ? -1 : 1;
				extraSets[id] = (extraSets[id] ?? 0) + delta;
				added[id] = (added[id] ?? 0) + delta;
				planNote = null;
				return async ({ result }) => {
					if (result.type === 'failure' && result.status === 409) {
						// An older plan: the set stays for this workout, the current plan is left alone.
						planNote = "Changed for this workout only — it's from an earlier plan.";
					} else if (result.type !== 'success') {
						extraSets[id] = (extraSets[id] ?? 0) - delta;
						added[id] = (added[id] ?? 0) - delta;
						planNote = "Couldn't change the sets. Try again.";
					}
				};
			}}
		>
			<input type="hidden" name="workoutExerciseId" value={item.id} />
			{#if sets < MAX_SETS}
				<button class="btn ghost small" name="delta" value="1">
					<Icon name="plus" size={18} />Add a set
				</button>
			{/if}
			{#if (added[item.id] ?? 0) > 0 && !logs[sets]}
				<button class="linkish" name="delta" value="-1">Remove set {sets}</button>
			{/if}
		</form>
		{#if planNote}<p class="muted plan-note" role="status">{planNote}</p>{/if}
	{/if}
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	<!-- Pinned to the bottom of the screen: rest timer and moving between exercises. -->
	<div class="dock">
		{#if timer}
			<Countdown
				label={timer.label}
				seconds={timer.seconds}
				startKey={timer.key}
				onclose={() => (timer = null)}
			/>
		{/if}
		<div class="pager">
			<button
				type="button"
				class="btn ghost"
				disabled={index === 0}
				onclick={() => go(index - 1)}
				aria-label="Previous exercise"><Icon name="chevronLeft" size={20} /></button
			>
			{#if index < data.items.length - 1}
				<button type="button" class="btn next-btn" onclick={() => go(index + 1)}>
					Next: {data.items[index + 1].exercise.name}<Icon name="chevronRight" size={20} />
				</button>
			{:else if !finished}
				<a class="btn next-btn" href="#finish">Finish up<Icon name="check" size={20} /></a>
			{/if}
		</div>
	</div>

	<div class="howto-slot">
		{#key ex.id}<ExerciseCues exercise={ex} collapsible />{/key}
	</div>

	{#if !finished && (index === data.items.length - 1 || allDone)}
		<section class="finish card" id="finish">
			<h2>{allDone ? 'All sets logged' : 'Finish up'}</h2>
			<form
				method="post"
				action="?/finish"
				use:enhance={async ({ cancel }) => {
					// Send any sets stored on the phone first; don't finish without them.
					if (pending.length) await sync();
					if (pending.length) {
						finishBlocked = true;
						cancel();
					}
				}}
			>
				<div class="finish-fields">
					<label>
						Body weight (optional)
						<input name="bodyWeight" type="number" inputmode="decimal" step="any" min="0" />
					</label>
					<label class="notes">
						Notes
						<textarea name="notes" rows="2" placeholder="How did it feel?"></textarea>
					</label>
				</div>
				{#if finishBlocked && pending.length}
					<p class="error" role="alert">
						Some sets are only on this phone. Reconnect, then finish so they're saved.
					</p>
				{/if}
				<button class="btn">Finish workout</button>
			</form>
		</section>
	{/if}

	{#if !finished}
		<div class="discard">
			{#if confirmDiscard}
				<form method="post" action="?/discard" class="row">
					<span>Delete this session and its sets?</span>
					<button class="btn small danger">Delete</button>
					<button type="button" class="btn ghost small" onclick={() => (confirmDiscard = false)}
						>Keep</button
					>
				</form>
			{:else}
				<button type="button" class="linkish" onclick={() => (confirmDiscard = true)}
					>Discard session</button
				>
			{/if}
		</div>
	{:else if !summary}
		<p class="muted">Completed {new Date(data.session.completedAt!).toLocaleString()}.</p>
	{/if}
</article>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.back {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		margin-left: -6px;
		font-weight: 500;
		text-decoration: none;
		color: var(--ink-2);
	}

	.count {
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--wash);
		font-size: 14px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* Summary */
	.summary {
		margin: 4px 0 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: flex-start;
		padding: 20px;
		border-radius: 20px;
	}

	.summary h2 {
		font-size: var(--hero);
		color: var(--lime);
	}

	.summary h3 {
		font-size: var(--h3);
		margin-top: 4px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 10px;
		width: 100%;
		margin: 0;
	}

	.stats div {
		background: var(--wash);
		border-radius: 12px;
		padding: 12px 14px;
	}

	.stats dt {
		font-size: 13px;
		color: var(--ink-2);
	}

	.stats dd {
		margin: 4px 0 0;
		font: 700 24px/1.1 var(--display);
	}

	.watch-note {
		margin: -4px 0 0;
		font-size: 13px;
	}

	.compare {
		margin: 0;
		font-weight: 600;
	}

	.records {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}

	.records li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}

	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 4px 0 12px;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--wash);
		font-size: 15px;
	}

	.banner.offline {
		border: 1.5px dashed var(--line-strong);
	}

	.pending-note {
		margin: 6px 0 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}

	/* Progress through the workout */
	.strip {
		display: flex;
		gap: 4px;
		margin: 6px 0 18px;
	}

	.pip {
		flex: 1;
		height: 28px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		position: relative;
	}

	.pip::after {
		content: '';
		position: absolute;
		inset: 11px 0;
		border-radius: 4px;
		background: var(--line);
		transition: background 0.2s ease;
	}

	.pip.complete::after {
		background: color-mix(in srgb, var(--lime) 45%, var(--line));
	}

	.pip.current::after {
		background: var(--lime);
		inset: 9px 0;
	}

	/* The exercise */
	.exercise {
		padding-bottom: 4px;
	}

	h1 {
		font-size: var(--h1);
	}

	.target {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px;
		margin: 8px 0 10px;
		font-weight: 600;
		font-size: 17px;
	}

	.last {
		margin: 12px 0 0;
		font-size: 15px;
		color: var(--ink-2);
	}

	.last strong {
		color: var(--ink);
	}

	.hint {
		margin: 8px 0 0;
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--lime) 12%, transparent);
		color: var(--lime);
		font-weight: 600;
		font-size: 15px;
	}

	.set-progress {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 18px 0 10px;
		font-size: 18px;
		color: var(--ink-2);
	}

	.set-progress strong {
		font: 700 var(--hero) / 1 var(--display);
		color: var(--ink);
	}

	.all-done {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--lime) !important;
		font-size: var(--h2) !important;
	}

	/* Sets */
	.sets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.sets li {
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--panel);
		padding: 10px;
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.sets li.logged {
		border-color: color-mix(in srgb, var(--lime) 40%, var(--line));
		background: color-mix(in srgb, var(--lime) 6%, var(--panel));
	}

	.sets form {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.set-label {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--wash);
		font: 700 17px/1 var(--display);
		color: var(--ink-2);
	}

	.set-label.next {
		background: var(--ink);
		color: var(--paper);
	}

	.logged .set-label {
		background: var(--lime);
		color: var(--on-accent);
		animation: pop 0.3s ease;
	}

	@keyframes pop {
		0% {
			transform: scale(0.6);
		}
		60% {
			transform: scale(1.15);
		}
		100% {
			transform: scale(1);
		}
	}

	.sets label {
		flex: 1;
		min-width: 0;
	}

	.sets input {
		min-height: 54px;
		text-align: center;
		font-size: 22px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		background: var(--paper);
	}

	.sets .btn {
		min-height: 54px;
	}

	.hold {
		margin-top: 8px;
		width: 100%;
	}

	.set-tools {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 10px;
	}

	.plan-note {
		margin: 6px 0 0;
		font-size: 13px;
	}

	/* Bottom dock */
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 20px -16px 0;
		padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
		background: color-mix(in srgb, var(--paper) 90%, transparent);
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--line);
	}

	.pager {
		display: flex;
		gap: 10px;
	}

	.pager .btn.ghost {
		width: 54px;
		padding: 0;
		flex-shrink: 0;
	}

	.next-btn {
		flex: 1;
		min-width: 0;
		justify-content: space-between;
	}

	.next-btn {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.howto-slot {
		margin-top: 16px;
	}

	/* Finish */
	.finish {
		margin-top: 24px;
		padding: 20px;
		border-radius: 20px;
	}

	.finish h2 {
		font-size: var(--h2);
		margin-bottom: 14px;
	}

	.finish form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.finish-fields {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: 12px;
	}

	.discard {
		margin-top: 28px;
		text-align: center;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 10px;
	}

	.danger {
		--accent: var(--danger);
	}

	.linkish {
		background: none;
		border: none;
		font: inherit;
		color: var(--ink-2);
		text-decoration: underline;
		min-height: 44px;
		cursor: pointer;
	}

	@media (max-width: 480px) {
		.finish-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
