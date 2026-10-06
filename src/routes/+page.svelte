<script lang="ts">
	import { enhance } from '$app/forms';
	import ReadinessNote from '#lib/components/ReadinessNote.svelte';
	import WeekView from '#lib/components/WeekView.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let confirming = $state(false);
	let switching = $state(false);

	const strength = $derived(data.workouts.filter((w) => w.kind !== 'mobility'));
	const mobility = $derived(data.workouts.filter((w) => w.kind === 'mobility'));
	const g = $derived(data.program.guidelines);

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
</script>

<section class="intro">
	<p class="kicker">Week {data.program.week} · Age {data.profile.age} · {g.ageBand}</p>
	<h1>Your plan</h1>
	{#if form?.switched}<p class="flash" role="status">
			New plan ready. Fresh exercises, same structure.
		</p>{/if}
</section>

<ReadinessNote readiness={data.readiness} />

{#if data.program.deload}
	<p class="deload card">
		<strong>Lighter week.</strong> Week {data.program.week} is a recovery week: 2 sets per lift at about
		60% of your usual weight. The workout screen sets this up for you.
	</p>
{/if}

{#if data.inProgress}
	<a class="resume card" href="/sessions/{data.inProgress.id}">
		<span class="kicker">In progress</span>
		<strong>{data.inProgress.title}</strong>
		<span class="muted">Pick up where you left off →</span>
	</a>
{/if}

<section class="next">
	<h2 class="sr-only">Up next</h2>
	{#each [data.nextStrength, data.nextMobility] as w (w.id)}
		<div class="card next-card kind-{w.kind}">
			<span class="kicker">{w.kind === 'mobility' ? 'Daily add-on' : 'Next lift'}</span>
			<h3>{w.title}</h3>
			<p class="muted">{w.focus}</p>
			<div class="row">
				<form method="post" action="?/start" use:enhance>
					<input type="hidden" name="workoutId" value={w.id} />
					<button class="btn">Start</button>
				</form>
				<a class="btn ghost" href="/workouts/{w.id}">Preview</a>
			</div>
		</div>
	{/each}
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
				</a>
			</li>
		{/each}
	</ul>
</section>

<section class="card rules">
	<h2>How to run it</h2>
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
</section>

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
	section {
		margin-top: 28px;
	}

	.intro {
		margin-top: 0;
	}

	h1 {
		font-size: 56px;
	}

	h2 {
		font-size: 30px;
	}

	.sub {
		margin: 4px 0 10px;
		font-size: 15px;
	}

	.flash {
		margin: 10px 0 0;
		padding: 10px 14px;
		background: var(--wash);
		border-radius: var(--radius);
		font-weight: 600;
	}

	.deload {
		margin: 16px 0 0;
		background: var(--wash);
		border: none;
	}

	.resume {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 20px;
		text-decoration: none;
		border-color: var(--ink);
	}

	.next {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 12px;
	}

	.next-card {
		border-top: 6px solid var(--accent);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.next-card h3 {
		font-size: 44px;
		color: var(--accent);
	}

	.next-card p {
		margin: 0 0 6px;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}

	.list a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		min-height: 64px;
		border: 1.5px solid var(--line);
		border-left: 6px solid var(--accent);
		border-radius: var(--radius);
		background: var(--panel);
		text-decoration: none;
	}

	.list a:hover {
		border-color: var(--accent);
	}

	.tag {
		font: 700 24px/1 var(--display);
		color: var(--accent);
	}

	.list .muted {
		font-size: 14px;
	}

	.rules dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 12px 0 0;
	}

	.rules dt {
		font-weight: 600;
	}

	.rules dd {
		margin: 0;
	}

	.note {
		margin: 10px 0 0;
		font-size: 15px;
	}

	.recent {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
	}

	.recent li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
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
		background: var(--accent);
	}

	.switch {
		border-top: 2px solid var(--ink);
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
