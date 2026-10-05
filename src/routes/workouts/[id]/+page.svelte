<script lang="ts">
	import { enhance } from '$app/forms';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let swapping = $state<number | null>(null);
	let openSwap = $state<number | null>(null);

	const isMobility = $derived(data.workout.kind === 'mobility');
</script>

<article class="kind-{data.workout.kind}">
	<header>
		<p class="kicker">{isMobility ? 'Daily add-on' : `Push / Pull · Week ${data.program.week}`}</p>
		<h1>{data.workout.title}</h1>
		<p class="focus">{data.workout.focus}</p>
		{#if !data.active}<p class="muted">From an earlier plan.</p>{/if}
	</header>

	<p class="warmup">{data.workout.warmup}</p>

	<ol>
		{#each data.exercises as { item, exercise }, i (item.id)}
			<li class="card">
				<span class="num" aria-hidden="true">{i + 1}</span>
				<div class="body">
					<h2>{exercise.name}</h2>
					<p class="target">
						{item.target}{#if item.rest !== '—'}<span class="muted"> · rest {item.rest}</span>{/if}
					</p>
					<ExerciseCues {exercise} />
				</div>
				{#if data.active}
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
				{#if openSwap === item.id}
					{@const options = data.alternatives[item.id] ?? []}
					<form
						id="swap-{item.id}"
						class="swap full"
						method="post"
						action="?/swap"
						use:enhance={() => {
							swapping = item.id;
							return async ({ update }) => {
								await update({ reset: false });
								swapping = null;
								openSwap = null;
							};
						}}
					>
						<input type="hidden" name="workoutExerciseId" value={item.id} />
						<p class="swap-title">Replace {exercise.name} with…</p>
						{#if options.length}
							<div class="options">
								{#each options as opt (opt.id)}
									<button
										class="option"
										name="exerciseId"
										value={opt.id}
										disabled={swapping !== null}
									>
										{opt.name}
										{#if opt.source === 'free-exercise-db'}<small class="muted">imported</small
											>{/if}
									</button>
								{/each}
							</div>
							<button class="btn small" disabled={swapping !== null}>
								{swapping === item.id ? 'Swapping…' : 'Surprise me'}
							</button>
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

	{#if data.active}
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
