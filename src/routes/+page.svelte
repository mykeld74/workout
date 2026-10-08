<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import WeekView from '#lib/components/WeekView.svelte';
	import { summarizeWeek } from '#lib/workout/week.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let confirming = $state(false);
	let switching = $state(false);

	const strength = $derived(data.workouts.filter((w) => w.kind !== 'mobility'));
	const mobility = $derived(data.workouts.filter((w) => w.kind === 'mobility'));
	const g = $derived(data.program.guidelines);
	const next = $derived(data.nextStrength);
	const ready = $derived(data.readiness);

	// Lifts this week use local days, so they're counted in the browser.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const LIFT_TARGET = 4;
	const liftsThisWeek = $derived(mounted ? summarizeWeek(data.history, 3).lifts : null);
	const ring = $derived(Math.min(1, (liftsThisWeek ?? 0) / LIFT_TARGET));
	const R = 26;
	const C = 2 * Math.PI * R;

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
</script>

<section class="intro">
	<p class="kicker">Week {data.program.week} · Age {data.profile.age}</p>
	<h1>Today</h1>
	{#if form?.switched}<p class="flash" role="status">
			New plan ready. Fresh exercises, same structure.
		</p>{/if}
</section>

<section class="today card kind-{next.kind}" aria-labelledby="today-title">
	<div class="today-top">
		<div class="today-text">
			<span class="kicker lime">{data.inProgress ? 'In progress' : 'Next lift'}</span>
			<h2 id="today-title">{data.inProgress?.title ?? next.title}</h2>
			<p class="muted">{next.focus}</p>
		</div>
		<div
			class="ring"
			role="img"
			aria-label={liftsThisWeek === null
				? 'Lifts this week'
				: `${liftsThisWeek} of ${LIFT_TARGET} lifts this week`}
		>
			<svg viewBox="0 0 64 64" aria-hidden="true">
				<circle cx="32" cy="32" r={R} class="track" />
				<circle
					cx="32"
					cy="32"
					r={R}
					class="fill"
					stroke-dasharray={C}
					stroke-dashoffset={C * (1 - ring)}
				/>
			</svg>
			<span class="ring-label">
				<strong>{liftsThisWeek ?? '–'}/{LIFT_TARGET}</strong>
				<small>this week</small>
			</span>
		</div>
	</div>

	{#if ready && ready.status !== 'unknown'}
		<p class="ready" class:easy={ready.status === 'easy'}>
			<Icon name="activity" size={18} />
			<span
				><strong>{ready.status === 'easy' ? 'Take it easier today.' : 'Ready to train.'}</strong>
				{ready.message}</span
			>
		</p>
	{/if}

	{#if data.program.deload}
		<p class="ready easy">
			<Icon name="clock" size={18} />
			<span><strong>Lighter week.</strong> 2 sets per lift at about 60% of your usual weight.</span>
		</p>
	{/if}

	<div class="row">
		{#if data.inProgress}
			<a class="btn grow" href="/sessions/{data.inProgress.id}"
				><Icon name="play" size={18} />Resume</a
			>
		{:else}
			<form method="post" action="?/start" use:enhance class="grow">
				<input type="hidden" name="workoutId" value={next.id} />
				<button class="btn wide-btn"><Icon name="play" size={18} />Start {next.title}</button>
			</form>
		{/if}
		<a class="btn ghost" href="/workouts/{next.id}">Preview</a>
	</div>

	<div class="addon kind-{data.nextMobility.kind}">
		<div>
			<span class="kicker">Daily add-on</span>
			<strong>{data.nextMobility.title}</strong>
			<span class="muted">12–14 min · stretch + core</span>
		</div>
		<form method="post" action="?/start" use:enhance>
			<input type="hidden" name="workoutId" value={data.nextMobility.id} />
			<button class="btn ghost small" aria-label="Start {data.nextMobility.title}"
				><Icon name="play" size={16} />Start</button
			>
		</form>
	</div>
</section>

<WeekView history={data.history} activity={data.activity} />

<section>
	<h2>Lifting days</h2>
	<p class="muted sub">Rotate Push A → Pull A → Push B → Pull B, about 4 days a week.</p>
	<ul class="list">
		{#each strength as w (w.id)}
			<li class="kind-{w.kind}">
				<a href="/workouts/{w.id}">
					<span class="tag">{w.title}</span>
					<span class="muted">{w.exerciseCount} exercises · done {w.timesDone}×</span>
					<span class="go" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<section>
	<h2>Mobility + core</h2>
	<p class="muted sub">12–14 minutes, one a day, away from lifting time.</p>
	<ul class="list">
		{#each mobility as w (w.id)}
			<li class="kind-{w.kind}">
				<a href="/workouts/{w.id}">
					<span class="tag">{w.title}</span>
					<span class="muted">{w.exerciseCount} exercises · done {w.timesDone}×</span>
					<span class="go" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<details class="card rules">
	<summary><h2>How to run it</h2></summary>
	<dl>
		<dt>Warm-up</dt>
		<dd>{g.warmup.replace(/^Warm-up /, '')}</dd>
		<dt>Effort</dt>
		<dd>{g.effort}</dd>
		<dt>Progress</dt>
		<dd>{g.progress}</dd>
		<dt>Deload</dt>
		<dd>{g.deload}</dd>
	</dl>
	{#each g.notes as note (note)}<p class="muted note">{note}</p>{/each}
</details>

{#if data.recent.length}
	<section>
		<h2>Recent</h2>
		<ul class="recent">
			{#each data.recent as s (s.id)}
				<li class="kind-{s.kind}">
					<span class="dot" aria-hidden="true"></span>
					<span>{s.title}</span>
					<span class="muted">{dateFmt.format(s.completedAt!)}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="switch">
	<h2>Ready to switch it up?</h2>
	<p class="muted">
		Builds a new set of workouts with the same structure and different exercises. Your logged
		history stays.
	</p>
	{#if confirming}
		<form
			method="post"
			action="?/switchItUp"
			use:enhance={() => {
				switching = true;
				return async ({ update }) => {
					await update();
					switching = false;
					confirming = false;
				};
			}}
		>
			<div class="row">
				<button class="btn" disabled={switching}
					>{switching ? 'Building…' : 'Yes, build a new plan'}</button
				>
				<button type="button" class="btn ghost" onclick={() => (confirming = false)}>Cancel</button>
			</div>
		</form>
	{:else}
		<button class="btn ghost" onclick={() => (confirming = true)}>New workouts</button>
	{/if}
</section>

<style>
	section,
	.rules {
		margin-top: 28px;
	}

	.intro {
		margin-top: 0;
	}

	h1 {
		font-size: var(--h1);
	}

	h2 {
		font-size: var(--h2);
	}

	.sub {
		margin: 4px 0 10px;
		font-size: 15px;
	}

	.lime {
		color: var(--lime);
	}

	.flash {
		margin: 10px 0 0;
		padding: 10px 14px;
		background: var(--wash);
		border-radius: var(--radius);
		font-weight: 600;
	}

	/* Today */
	.today {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		border-radius: 20px;
	}

	.today-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.today h2 {
		font-size: var(--hero);
		margin-top: 4px;
	}

	.today-text p {
		margin: 6px 0 0;
		font-size: 15px;
	}

	.ring {
		position: relative;
		flex-shrink: 0;
		width: 76px;
		height: 76px;
	}

	.ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring circle {
		fill: none;
		stroke-width: 6;
	}

	.ring .track {
		stroke: var(--line);
	}

	.ring .fill {
		stroke: var(--lime);
		stroke-linecap: round;
		transition: stroke-dashoffset 0.6s ease;
	}

	.ring-label {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		line-height: 1.1;
	}

	.ring-label strong {
		font-size: 17px;
	}

	.ring-label small {
		font-size: 10px;
		color: var(--ink-2);
	}

	.ready {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin: 0;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--wash);
		font-size: 14px;
		color: var(--ink-2);
	}

	.ready :global(svg) {
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--lime);
	}

	.ready strong {
		color: var(--ink);
	}

	.ready.easy :global(svg) {
		color: var(--push);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.grow {
		flex: 1;
		display: flex;
	}

	.grow .wide-btn,
	a.grow {
		flex: 1;
	}

	.addon {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}

	.addon div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.addon .kicker {
		color: var(--kind);
	}

	.addon .muted {
		font-size: 13px;
	}

	/* Workout lists */
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}

	.list a {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 40px 14px 18px;
		min-height: 64px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--panel);
		text-decoration: none;
		overflow: hidden;
		transition: border-color 0.15s ease;
	}

	.list a::before {
		content: '';
		position: absolute;
		left: 0;
		top: 12px;
		bottom: 12px;
		width: 4px;
		border-radius: 0 4px 4px 0;
		background: var(--kind);
	}

	.list a:hover {
		border-color: var(--line-strong);
	}

	.go {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--ink-2);
		display: flex;
	}

	.tag {
		font: 700 18px/1.1 var(--display);
	}

	.list .muted {
		font-size: 14px;
	}

	/* How to run it */
	.rules summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.rules summary::-webkit-details-marker {
		display: none;
	}

	.rules summary::after {
		content: '+';
		font-size: 24px;
		color: var(--ink-2);
	}

	.rules[open] summary::after {
		content: '–';
	}

	.rules h2 {
		display: inline;
	}

	.rules dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 14px 0 0;
	}

	.rules dt {
		font-weight: 600;
	}

	.rules dd {
		margin: 0;
		color: var(--ink-2);
	}

	.note {
		margin: 10px 0 0;
		font-size: 15px;
	}

	/* Recent and switch */
	.recent {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
	}

	.recent li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}

	.recent li .muted {
		margin-left: auto;
		font-size: 15px;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--kind);
	}

	.switch {
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}

	.switch p {
		margin: 6px 0 12px;
	}

	@media (max-width: 480px) {
		.rules dl {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		.rules dd {
			margin-bottom: 8px;
		}
	}
</style>
