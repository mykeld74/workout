<script lang="ts">
	import { enhance } from '$app/forms';
	import Countdown from '#lib/components/Countdown.svelte';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
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

	type Log = (typeof data.logs)[number];

	/** Logged sets keyed by workout exercise, then set number. */
	const logsByItem = $derived.by(() => {
		const byItem: Record<number, Record<number, Log>> = {};
		for (const log of data.logs) {
			byItem[log.workoutExerciseId] ??= {};
			byItem[log.workoutExerciseId][log.setNumber] = log;
		}
		return byItem;
	});

	function doneCount(itemId: number) {
		return Object.keys(logsByItem[itemId] ?? {}).length;
	}

	// Open on the first exercise that still has sets left.
	let index = $state(0);
	let initialised = false;
	$effect.pre(() => {
		if (initialised) return;
		initialised = true;
		const first = data.items.findIndex(({ item }) => doneCount(item.id) < item.sets);
		index = first === -1 ? data.items.length - 1 : first;
	});

	const current = $derived(data.items[index]);
	const item = $derived(current.item);
	const ex = $derived(current.exercise);
	const sets = $derived(item.sets);
	const logs = $derived(logsByItem[item.id] ?? {});
	const previous = $derived(data.previous[ex.id]);
	const weighted = $derived(ex.equipment.some((e) => LOADABLE.includes(e)));
	const unitLabel = $derived(item.unit === 'seconds' ? 'sec' : 'reps');
	const allDone = $derived(data.items.every(({ item }) => doneCount(item.id) >= item.sets));

	/** "Hit the top of the range on every set → next dumbbell up." */
	const progressHint = $derived.by(() => {
		if (!previous || item.repHigh === null || item.unit !== 'reps') return null;
		const hitTop =
			previous.sets.length >= sets && previous.sets.every((s) => (s.reps ?? 0) >= item.repHigh!);
		if (!hitTop) return null;
		return weighted
			? 'You hit the top of the range every set last time. Go up a weight.'
			: 'You hit the top of the range last time. Slow the lowering or add a pause.';
	});

	function defaultWeight(setNumber: number): number | string {
		const logged = logs[setNumber]?.weight ?? logs[setNumber - 1]?.weight;
		if (logged != null) return logged;
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
</script>

<article class="kind-{kind}">
	<header>
		<a class="back" href="/workouts/{data.workout.id}">← {data.workout.title}</a>
		<span class="kicker">{index + 1} of {data.items.length}</span>
	</header>

	<nav class="strip" aria-label="Exercises">
		{#each data.items as { item: it, exercise: e }, i (it.id)}
			<button
				type="button"
				class="pip"
				class:current={i === index}
				class:complete={doneCount(it.id) >= it.sets}
				aria-label="{i + 1}. {e.name}{doneCount(it.id) >= it.sets ? ' (done)' : ''}"
				aria-current={i === index ? 'step' : undefined}
				onclick={() => go(i)}
			></button>
		{/each}
	</nav>

	<section class="exercise">
		<span class="num">{index + 1}</span>
		<h1>{ex.name}</h1>
		<p class="target">
			{item.target}
			{#if item.rest !== '—'}<span class="muted"> · rest {item.rest}</span>{/if}
		</p>
		{#key ex.id}<ExerciseCues exercise={ex} collapsible />{/key}

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
					use:enhance={() => {
						// Start resting the moment Done is tapped, not after the save round-trip.
						// Updating an already-logged set doesn't restart it.
						const rest = logged ? null : minRestSeconds(item.rest);
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
				{#if item.unit === 'seconds' && !logged}
					<button
						type="button"
						class="hold btn ghost small"
						onclick={() => (timer = { label: 'Hold', seconds: item.repLow ?? 30, key: Date.now() })}
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

	{#if !finished && (index === data.items.length - 1 || allDone)}
		<section class="finish card">
			<h2>{allDone ? 'All sets logged' : 'Finish up'}</h2>
			<form method="post" action="?/finish">
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
	{:else}
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
