<script lang="ts">
	import { onMount } from 'svelte';
	import {
		summarizeActivity,
		summarizeWeek,
		type Activity,
		type Finished
	} from '#lib/workout/week.ts';

	interface Props {
		history: Finished[];
		/** Steps and watch workouts from Samsung Health, if connected. */
		activity?: Activity;
		/** Lifting days a week the plan aims for. */
		liftTarget?: number;
		/** Lifting days a week that keep the streak going. */
		streakMin?: number;
	}

	let { history, activity, liftTarget = 4, streakMin = 3 }: Props = $props();

	// Days depend on the phone's time zone, so this renders in the browser only.
	let mounted = $state(false);
	onMount(() => (mounted = true));

	const view = $derived(summarizeWeek(history, streakMin));
	const moves = $derived(activity ? summarizeActivity(activity, history) : null);
</script>

{#if mounted}
	<section class="week card" aria-labelledby="week-title">
		<div class="top">
			<h2 id="week-title">This week</h2>
			<p class="streak">
				{#if view.streak}
					<strong>{view.streak}-week streak</strong>
				{:else}
					<span class="muted">No streak yet</span>
				{/if}
				<span class="muted"> · {streakMin}+ lifts a week</span>
			</p>
		</div>

		<ol class="days">
			{#each view.days as d (d.name)}
				<li class:today={d.today} class:future={d.future}>
					<span class="label" aria-hidden="true">{d.label}</span>
					<span class="marks" aria-hidden="true">
						<span class="mark lift" class:on={d.lift}></span>
						<span class="mark mob" class:on={d.mobility}></span>
					</span>
					<span class="sr-only"
						>{d.name}{d.today ? ' (today)' : ''}: {d.lift ? 'lifted' : 'no lift'}, {d.mobility
							? 'mobility done'
							: 'no mobility'}</span
					>
				</li>
			{/each}
		</ol>

		<p class="totals">
			<span
				><span class="key lift" aria-hidden="true"></span> Lifts {view.lifts} of {liftTarget}</span
			>
			<span><span class="key mob" aria-hidden="true"></span> Mobility {view.mobility} of 7</span>
			{#if moves?.stepsPerDay}
				<span>{moves.stepsPerDay.toLocaleString()} steps a day</span>
			{/if}
		</p>

		{#if moves?.cardio.length}
			<div class="cardio">
				<p class="cardio-title">Cardio this week · {moves.cardioMinutes} min</p>
				<ul>
					{#each moves.cardio as c (c.time.getTime())}
						<li>
							<span>{c.name}</span>
							<span class="muted"
								>{c.time.toLocaleDateString(undefined, { weekday: 'short' })} · {c.minutes} min{c.miles
									? ` · ${c.miles} mi`
									: ''}</span
							>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}

<style>
	.week {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 4px 12px;
	}

	h2 {
		font-size: var(--h2);
	}

	.streak {
		margin: 0;
		font-size: 15px;
	}

	.days {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}

	.days li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		border-radius: 8px;
	}

	.days li.today {
		background: var(--wash);
	}

	.days li.future {
		opacity: 0.55;
	}

	.label {
		font-weight: 600;
		font-size: 14px;
		color: var(--ink-2);
	}

	.today .label {
		color: var(--ink);
	}

	.marks {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.mark {
		width: 22px;
		height: 8px;
		border-radius: 4px;
		background: var(--line);
		opacity: 0.6;
	}

	.mark.lift.on {
		background: var(--push);
		opacity: 1;
	}

	.mark.mob.on {
		background: var(--mobility);
		opacity: 1;
	}

	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}

	.cardio {
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}

	.cardio-title {
		margin: 0 0 4px;
		font-weight: 600;
		font-size: 15px;
	}

	.cardio ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cardio li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0;
		font-size: 15px;
	}

	.key {
		display: inline-block;
		width: 14px;
		height: 8px;
		border-radius: 4px;
		margin-right: 4px;
		vertical-align: middle;
	}

	.key.lift {
		background: var(--push);
	}

	.key.mob {
		background: var(--mobility);
	}
</style>
