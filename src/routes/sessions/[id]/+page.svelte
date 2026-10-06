<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import Countdown from '#lib/components/Countdown.svelte';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
	import ReadinessNote from '#lib/components/ReadinessNote.svelte';
	import { unlockAudio } from '#lib/alert-sound.ts';
	import { addPending, flushPending, readPending, type PendingSet } from '#lib/offline-sets.ts';
	import { deloadWeight, nextWeight } from '#lib/workout/progression.ts';
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

	/** Logged sets keyed by workout exercise, then set number, including ones waiting to sync. */
	const logsByItem = $derived.by(() => {
		const byItem: Record<number, Record<number, Log>> = {};
		for (const log of data.logs) {
			if (log.workoutExerciseId === null) continue;
			byItem[log.workoutExerciseId] ??= {};
			byItem[log.workoutExerciseId][log.setNumber] = log;
		}
		for (const p of pending) {
			byItem[p.workoutExerciseId] ??= {};
			byItem[p.workoutExerciseId][p.setNumber] = { ...p, pending: true };
		}
		return byItem;
	});

	/** Lighter week: 2 sets on lifts. */
	function setsFor(it: (typeof data.items)[number]['item']) {
		return data.deload && it.role !== 'core' && it.role !== 'stretch'
			? Math.min(2, it.sets)
			: it.sets;
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
	const previous = $derived(data.previous[ex.id]);
	const weighted = $derived(ex.equipment.some((e) => LOADABLE.includes(e)));
	const unitLabel = $derived(item.unit === 'seconds' ? 'sec' : 'reps');
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

	function defaultWeight(setNumber: number): number | string {
		const logged = logs[setNumber]?.weight ?? logs[setNumber - 1]?.weight;
		if (logged != null) return logged;
		if (suggested) return suggested;
		return previous?.sets[setNumber - 1]?.weight ?? previous?.sets[0]?.weight ?? '';
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
		<a class="back" href="/workouts/{data.workout.id}">← {data.workout.title}</a>
		<span class="kicker">{index + 1} of {data.items.length}</span>
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
						<dt>Active calories</dt>
						<dd>{data.vitals.calories}</dd>
					</div>
				{/if}
			</dl>
			{#if data.vitals}
				<p class="muted watch-note">Heart rate and calories from your Galaxy Watch.</p>
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
		<span class="num">{index + 1}</span>
		<h1>{ex.name}</h1>
		<p class="target">
			{item.target}{#if sets < item.sets}<span class="muted"> → {sets} sets this week</span>{/if}
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

	{#if timer}
		<div class="timer-slot">
			<Countdown
				label={timer.label}
				seconds={timer.seconds}
				startKey={timer.key}
				onclose={() => (timer = null)}
			/>
		</div>
	{/if}

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
							await update({ reset: false });
							// The set didn't save: drop the timer we started for it.
							if (result.type !== 'success' && started !== null && timer?.key === started) {
								timer = null;
							}
						};
					}}
				>
					<input type="hidden" name="workoutExerciseId" value={item.id} />
					<input type="hidden" name="setNumber" value={setNumber} />
					<span class="set-label">Set {setNumber}</span>
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
							value={logged?.reps ?? item.repHigh ?? ''}
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
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	<div class="pager">
		<button type="button" class="btn ghost" disabled={index === 0} onclick={() => go(index - 1)}
			>← Prev</button
		>
		{#if index < data.items.length - 1}
			<button type="button" class="btn" onclick={() => go(index + 1)}>Next →</button>
		{/if}
	</div>

	<div class="howto-slot">
		{#key ex.id}<ExerciseCues exercise={ex} collapsible />{/key}
	</div>

	{#if !finished && (index === data.items.length - 1 || allDone)}
		<section class="finish card">
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
		font-weight: 600;
		text-decoration: none;
		color: var(--accent);
		min-height: 44px;
		display: flex;
		align-items: center;
	}

	.summary {
		border-top: 6px solid var(--accent);
		margin: 4px 0 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: flex-start;
	}

	.summary h2 {
		font-size: 40px;
		color: var(--accent);
	}

	.summary h3 {
		font: 700 22px/1 var(--display);
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
		border-radius: 8px;
		padding: 10px 12px;
	}

	.stats dt {
		font-size: 13px;
		color: var(--ink-2);
	}

	.stats dd {
		margin: 2px 0 0;
		font: 800 26px/1.1 var(--display);
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
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}

	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 4px 0 12px;
		padding: 10px 14px;
		border-radius: var(--radius);
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

	.strip {
		display: flex;
		gap: 4px;
		margin: 8px 0 18px;
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
		inset: 10px 0;
		border-radius: 4px;
		background: var(--line);
	}

	.pip.complete::after {
		background: var(--accent);
		opacity: 0.45;
	}

	.pip.current::after {
		background: var(--accent);
		opacity: 1;
		inset: 7px 0;
	}

	.exercise {
		border-bottom: 4px solid var(--accent);
		padding-bottom: 14px;
	}

	.num {
		font: 800 28px/1 var(--display);
		color: var(--accent);
	}

	h1 {
		font-size: 48px;
		margin-top: 2px;
	}

	.target {
		font-weight: 600;
		font-size: 18px;
		margin: 8px 0 10px;
	}

	.last {
		margin: 12px 0 0;
		font-size: 15px;
	}

	.hint {
		margin: 6px 0 0;
		font-weight: 600;
		color: var(--good);
	}

	.timer-slot {
		position: sticky;
		top: 8px;
		z-index: 2;
		margin-top: 14px;
	}

	.sets {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sets li {
		border: 1.5px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--panel);
		padding: 10px 12px;
	}

	.sets li.logged {
		border-color: var(--accent);
		background: var(--wash);
	}

	.sets form {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.set-label {
		font: 700 20px/1 var(--display);
		min-width: 52px;
		color: var(--accent);
	}

	.sets label {
		flex: 1;
		min-width: 0;
	}

	.sets input {
		text-align: center;
		font-size: 20px;
		font-weight: 600;
	}

	.hold {
		margin-top: 8px;
		width: 100%;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-top: 20px;
	}

	.pager .btn {
		flex: 1;
	}

	.howto-slot {
		margin-top: 16px;
	}

	.finish {
		margin-top: 24px;
		border-top: 6px solid var(--accent);
	}

	.finish h2 {
		font-size: 30px;
		margin-bottom: 12px;
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
		h1 {
			font-size: 40px;
		}
		.finish-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
