<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
	import { PATTERNS, type Pattern } from '#lib/workout/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let openSwap = $state<number | null>(null);
	let editing = $state(false);
	let confirmRemove = $state<number | null>(null);
	let addQuery = $state('');

	const isMobility = $derived(data.workout.kind === 'mobility');
	const addMatches = $derived.by(() => {
		const q = addQuery.trim().toLowerCase();
		const list = q
			? data.addable.filter((ex) =>
					`${ex.name} ${PATTERNS[ex.pattern as Pattern] ?? ''}`.toLowerCase().includes(q)
				)
			: data.addable;
		return list.slice(0, 30);
	});

	/** Every editor form: keep inputs, block double taps, then run `after`. */
	const submit =
		(after?: () => void): SubmitFunction =>
		() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
				after?.();
			};
		};
</script>

<article class="kind-{data.workout.kind}">
	<header>
		<div class="title-row">
			<div>
				<p class="kicker">
					{isMobility ? 'Daily add-on' : `Push / Pull · Week ${data.program.week}`}
				</p>
				<h1>{data.workout.title}</h1>
			</div>
			{#if data.active}
				<button
					type="button"
					class="btn small"
					class:ghost={!editing}
					aria-pressed={editing}
					onclick={() => {
						editing = !editing;
						openSwap = null;
						confirmRemove = null;
					}}
				>
					{editing ? 'Done editing' : 'Edit plan'}
				</button>
			{/if}
		</div>
		<p class="focus">{data.workout.focus}</p>
		{#if !data.active}<p class="muted">From an earlier plan.</p>{/if}
	</header>

	{#if !editing}<p class="warmup">{data.workout.warmup}</p>{/if}
	{#if form?.editError}<p class="error" role="alert">{form.editError}</p>{/if}

	<ol class:editing>
		{#each data.exercises as { item, exercise }, i (item.id)}
			<li class="card">
				<span class="num" aria-hidden="true">{i + 1}</span>
				<div class="body">
					<h2>{exercise.name}</h2>
					<p class="target">
						{item.target}{#if item.rest !== '—'}<span class="muted">&nbsp;· rest {item.rest}</span
							>{/if}
					</p>
					{#if !editing}<ExerciseCues {exercise} />{/if}
				</div>
				{#if data.active && !editing}
					<button
						type="button"
						class="btn ghost small"
						aria-expanded={openSwap === item.id}
						aria-controls="swap-{item.id}"
						onclick={() => (openSwap = openSwap === item.id ? null : item.id)}
					>
						{openSwap === item.id ? 'Close' : 'Swap'}<span class="sr-only"> {exercise.name}</span>
					</button>
				{/if}

				{#if editing}
					<div class="move">
						<form method="post" action="?/move" use:enhance={submit()}>
							<input type="hidden" name="workoutExerciseId" value={item.id} />
							<button
								class="icon-btn"
								name="direction"
								value="up"
								disabled={busy || i === 0}
								aria-label="Move {exercise.name} up"
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
							</button>
							<button
								class="icon-btn"
								name="direction"
								value="down"
								disabled={busy || i === data.exercises.length - 1}
								aria-label="Move {exercise.name} down"
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
							</button>
						</form>
					</div>
					<div class="edit-row full">
						<form class="target-form" method="post" action="?/target" use:enhance={submit()}>
							<input type="hidden" name="workoutExerciseId" value={item.id} />
							<label>
								Sets
								<input
									name="sets"
									type="number"
									inputmode="numeric"
									min="1"
									max="10"
									value={item.sets}
								/>
							</label>
							<label>
								{item.unit === 'seconds' ? 'Seconds' : 'Reps'} from
								<input
									name="repLow"
									type="number"
									inputmode="numeric"
									min="1"
									value={item.repLow ?? ''}
								/>
							</label>
							<label>
								to
								<input
									name="repHigh"
									type="number"
									inputmode="numeric"
									min="1"
									value={item.repHigh ?? ''}
								/>
							</label>
							<button class="btn small" disabled={busy}>Save</button>
						</form>
						{#if form?.targetError === item.id}
							<p class="error">Use whole numbers: 1–10 sets and a rep range.</p>
						{:else if form?.targetSaved === item.id}
							<p class="saved" role="status">Saved</p>
						{/if}
						<div class="edit-actions">
							<button
								type="button"
								class="btn ghost small"
								onclick={() => (openSwap = openSwap === item.id ? null : item.id)}
								aria-expanded={openSwap === item.id}>Swap</button
							>
							{#if confirmRemove === item.id}
								<form
									method="post"
									action="?/remove"
									use:enhance={submit(() => (confirmRemove = null))}
								>
									<input type="hidden" name="workoutExerciseId" value={item.id} />
									<span class="confirm-text">Remove {exercise.name}?</span>
									<button class="btn small danger" disabled={busy}>Remove</button>
									<button
										type="button"
										class="btn ghost small"
										onclick={() => (confirmRemove = null)}>Keep</button
									>
								</form>
							{:else}
								<button
									type="button"
									class="btn ghost small danger"
									onclick={() => (confirmRemove = item.id)}>Remove</button
								>
							{/if}
						</div>
					</div>
				{/if}

				{#if openSwap === item.id}
					{@const options = data.alternatives[item.id] ?? []}
					<form
						id="swap-{item.id}"
						class="swap full"
						method="post"
						action="?/swap"
						use:enhance={submit(() => (openSwap = null))}
					>
						<input type="hidden" name="workoutExerciseId" value={item.id} />
						<p class="swap-title">Replace {exercise.name} with…</p>
						{#if options.length}
							<div class="options">
								{#each options as opt (opt.id)}
									<button class="option" name="exerciseId" value={opt.id} disabled={busy}>
										{opt.name}
										{#if opt.source === 'free-exercise-db'}<small class="muted">imported</small
											>{/if}
									</button>
								{/each}
							</div>
							<button class="btn small" disabled={busy}>{busy ? 'Swapping…' : 'Surprise me'}</button
							>
						{:else}
							<p class="muted">Nothing else fits this slot with your equipment.</p>
						{/if}
					</form>
				{/if}
				{#if form?.swapFailed === item.id}
					<p class="error full">
						No other exercise fits this slot with your equipment. Import more from the Exercises
						page.
					</p>
				{/if}
			</li>
		{/each}
	</ol>

	{#if editing}
		<section class="add card">
			<h2>Add an exercise</h2>
			<label>
				<span class="sr-only">Search exercises to add</span>
				<input type="search" placeholder="Search, e.g. curl, plank, calf" bind:value={addQuery} />
			</label>
			<form
				class="options add-list"
				method="post"
				action="?/add"
				use:enhance={submit(() => (addQuery = ''))}
			>
				{#each addMatches as ex (ex.id)}
					<button class="option" name="exerciseId" value={ex.id} disabled={busy}>
						<span>{ex.favorite ? '★ ' : ''}{ex.name}</span>
						<small class="muted">{PATTERNS[ex.pattern as Pattern] ?? ex.pattern}</small>
					</button>
				{:else}
					<p class="muted">No matches that fit your equipment.</p>
				{/each}
			</form>
			<p class="muted hint">Added exercises go at the end; use the arrows to move them.</p>
		</section>
	{:else if data.active}
		<form method="post" action="?/start" class="start">
			<button class="btn">Start {data.workout.title}</button>
		</form>
	{/if}
</article>

<style>
	header {
		border-bottom: 4px solid var(--accent);
		padding-bottom: 12px;
	}

	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 12px;
	}

	h1 {
		font-size: 64px;
		color: var(--accent);
	}

	.focus {
		margin: 6px 0 0;
		font-weight: 500;
	}

	.warmup {
		background: var(--wash);
		border-radius: var(--radius);
		padding: 12px 14px;
		font-size: 15px;
		margin: 16px 0;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	li {
		display: grid;
		grid-template-columns: 32px 1fr auto;
		gap: 12px;
		align-items: start;
	}

	.num {
		font: 700 32px/1 var(--display);
		color: var(--accent);
	}

	h2 {
		font: 600 19px/1.25 var(--body);
	}

	.target {
		margin: 4px 0 8px;
		font-weight: 600;
	}

	.full {
		grid-column: 1 / -1;
		margin: 0;
		font-size: 15px;
	}

	.swap {
		border-top: 1px solid var(--line);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}

	.swap-title {
		margin: 0;
		font-weight: 600;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 6px;
		width: 100%;
		max-height: 320px;
		overflow-y: auto;
	}

	.option {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 12px;
		text-align: left;
		font: 500 15px/1.25 var(--body);
		color: var(--ink);
		background: var(--paper);
		border: 1.5px solid var(--line);
		border-radius: 8px;
		cursor: pointer;
	}

	.option:hover {
		border-color: var(--accent);
	}

	.editing li {
		grid-template-columns: 32px 1fr auto;
	}

	.move form {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 44px;
		height: 40px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}

	.icon-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.icon-btn svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.edit-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}

	.target-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
	}

	.target-form label {
		width: 96px;
		font-size: 14px;
	}

	.target-form input {
		text-align: center;
	}

	.edit-actions,
	.edit-actions form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.confirm-text {
		font-weight: 600;
	}

	.danger {
		--accent: var(--danger);
	}

	.saved {
		margin: 0;
		color: var(--good);
		font-weight: 600;
	}

	.edit-row .error {
		margin: 0;
	}

	.add {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.add h2 {
		font: 700 26px/1 var(--display);
	}

	.add-list {
		max-height: 360px;
	}

	.hint {
		margin: 0;
		font-size: 14px;
	}

	.start {
		position: sticky;
		bottom: 16px;
		margin-top: 20px;
		display: flex;
	}

	.start .btn {
		flex: 1;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
	}
</style>
