<script lang="ts">
	import { enhance } from '$app/forms';
	import BarChart from '#lib/components/BarChart.svelte';
	import LineChart from '#lib/components/LineChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let selectedId = $state<string | null>(null);
	let showAllSessions = $state(false);
	let confirmRemove = $state<number | null>(null);

	const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	/** "2026-10-06" → "Oct 6" (a calendar day, so no time zone shift). */
	const dayLabel = (day: string) =>
		new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	const selected = $derived(
		data.exercises.find((e) => e.id === selectedId) ?? data.exercises[0] ?? null
	);

	const timeFmt = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: data.timeZone
		})
	);

	const dateFmt = $derived(
		new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: data.timeZone
		})
	);

	/** Weighted exercises chart the estimated max; bodyweight and timed ones chart reps or seconds. */
	const weighted = $derived(!!selected?.points.some((p) => p.weight));
	const unitWord = $derived(selected?.unit === 'seconds' ? 'sec' : 'reps');

	function setText(p: { weight: number | null; reps: number | null }, unit: string) {
		const reps = `${p.reps ?? '–'} ${unit === 'seconds' ? 'sec' : 'reps'}`;
		return p.weight ? `${p.weight} lb × ${reps}` : reps;
	}

	const records = $derived(
		data.exercises
			.flatMap((e) =>
				e.points.filter((p) => p.record).map((p) => ({ ...p, name: e.name, unit: e.unit }))
			)
			.sort((a, b) => b.date.getTime() - a.date.getTime())
			.slice(0, 6)
	);

	function change(points: { best: number }[]) {
		if (points.length < 2) return null;
		const first = points[0].best;
		const last = points.at(-1)!.best;
		return first ? Math.round(((last - first) / first) * 100) : null;
	}
</script>

<section class="intro">
	<p class="kicker">Progress</p>
	<h1>Getting stronger</h1>
</section>

<div class="board">
	{#if !data.exercises.length}
		<p class="card empty span">
			Finish a workout with a few logged sets and your progress shows up here: best sets, personal
			records and body weight over time.
		</p>
	{:else}
		{#if records.length}
			<section class="span">
				<h2>Recent personal records</h2>
				<ul class="records">
					{#each records as r (r.name + r.date.getTime())}
						<li class="card">
							<strong>{r.name}</strong>
							<span>{setText(r, r.unit)}</span>
							<span class="muted">{dateFmt.format(r.date)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if selected}
			<section class="card focus span">
				<label class="picker">
					Exercise
					<select value={selected.id} onchange={(e) => (selectedId = e.currentTarget.value)}>
						{#each data.exercises as e (e.id)}
							<option value={e.id}>{e.name} ({e.points.length})</option>
						{/each}
					</select>
				</label>

				<div class="headline">
					<div>
						<p class="muted small">Latest best set</p>
						<p class="figure">{setText(selected.points.at(-1)!, selected.unit)}</p>
					</div>
					{#if change(selected.points) !== null}
						{@const pct = change(selected.points)!}
						<div>
							<p class="muted small">Since first logged</p>
							<p class="figure">{pct >= 0 ? '+' : '−'}{Math.abs(pct)}%</p>
						</div>
					{/if}
				</div>

				<h2 class="chart-title">
					{weighted ? 'Estimated max (lb)' : `Best ${unitWord}`} per workout
				</h2>
				{#if weighted}
					<p class="muted small">
						Combines weight and reps so heavier-but-fewer and lighter-but-more sets compare fairly.
					</p>
				{/if}
				{#if selected.points.length >= 2}
					{#key selected.id}
						<LineChart
							label="{selected.name}, {weighted ? 'estimated max' : unitWord} over time"
							formatY={(n) => (weighted ? `${Math.round(n)}` : `${Math.round(n)}`)}
							points={selected.points.map((p) => ({
								date: p.date,
								value: p.best,
								highlight: p.record,
								lines: [
									setText(p, selected.unit),
									...(weighted ? [`≈ ${Math.round(p.best)} lb max`] : [])
								]
							}))}
						/>
					{/key}
				{:else}
					<p class="muted single">
						Logged once so far. Do it again and your trend line starts here.
					</p>
				{/if}

				<details>
					<summary>Show as table</summary>
					<table>
						<thead>
							<tr><th>Date</th><th>Best set</th><th>Weight moved</th><th>PR</th></tr>
						</thead>
						<tbody>
							{#each [...selected.points].reverse() as p (p.date.getTime())}
								<tr>
									<td>{dateFmt.format(p.date)}</td>
									<td>{setText(p, selected.unit)}</td>
									<td>{p.volume ? `${Math.round(p.volume).toLocaleString()} lb` : '—'}</td>
									<td>{p.record ? 'Yes' : ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>
		{/if}

		<section class="span">
			<h2>All exercises</h2>
			<ul class="list">
				{#each data.exercises as e (e.id)}
					{@const pct = change(e.points)}
					<li>
						<button
							type="button"
							aria-pressed={selected?.id === e.id}
							onclick={() => {
								selectedId = e.id;
								window.scrollTo({ top: 0, behavior: 'smooth' });
							}}
						>
							<span class="name">{e.name}</span>
							<span class="muted">{setText(e.points.at(-1)!, e.unit)}</span>
							{#if pct !== null}<span class="delta">{pct >= 0 ? '+' : '−'}{Math.abs(pct)}%</span
								>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="card focus">
		<h2 class="chart-title">Body weight</h2>
		<p class="muted small">One reading per day: the one closest to 6:00 AM.</p>
		{#if data.bodyWeight.length >= 2}
			<LineChart
				label="Body weight over time"
				formatY={(n) => `${Math.round(n)}`}
				points={data.bodyWeight.map((b) => ({
					date: b.date,
					value: b.weight,
					lines: [
						`${b.weight} lb`,
						`${timeFmt.format(b.date)} · ${b.source === 'samsung' ? 'Samsung Health' : 'entered after a workout'}`
					]
				}))}
			/>
			<details>
				<summary>Show as table</summary>
				<table>
					<thead><tr><th>Date</th><th>Time</th><th>Body weight</th><th>Source</th></tr></thead>
					<tbody>
						{#each [...data.bodyWeight].reverse() as b (b.date.getTime())}
							<tr>
								<td>{dateFmt.format(b.date)}</td>
								<td>{timeFmt.format(b.date)}</td>
								<td>{b.weight} lb</td>
								<td>{b.source === 'samsung' ? 'Samsung Health' : 'Workout'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{:else}
			<p class="muted">
				Add your body weight when you finish a workout, or <a href="/health"
					>connect Samsung Health</a
				>
				({data.bodyWeight.length} so far). The trend appears after two entries.
			</p>
		{/if}
	</section>

	{#each [{ title: 'Resting heart rate', unit: 'bpm', rows: data.restingHr, note: 'Lower over time usually means better fitness. The rate you usually sit at while you are up, not the lowest beat of the day.' }, { title: 'Heart rate variability', unit: 'ms', rows: data.hrv, note: 'Higher usually means better recovered. From your Galaxy Watch, one value per day.' }] as m (m.title)}
		{#if m.rows.length >= 2}
			<section class="card focus">
				<h2 class="chart-title">{m.title} ({m.unit})</h2>
				<p class="muted small">{m.note}</p>
				<LineChart
					label="{m.title} over time"
					formatY={(n) => `${Math.round(n)}`}
					points={m.rows.map((r) => ({
						date: r.date,
						value: r.value,
						lines: [`${r.value} ${m.unit}`]
					}))}
				/>
				<details>
					<summary>Show as table</summary>
					<table>
						<thead><tr><th>Date</th><th>{m.title}</th></tr></thead>
						<tbody>
							{#each [...m.rows].reverse() as r (r.date.getTime())}
								<tr><td>{dateFmt.format(r.date)}</td><td>{r.value} {m.unit}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>
		{/if}
	{/each}

	{#if data.activity.hasData}
		<div class="span activity-head">
			<h2>Activity</h2>
			<p class="muted small">From Samsung Health via your phone and Galaxy Watch.</p>
		</div>

		<div class="card focus">
			<h3 class="chart-title">Steps per day</h3>
			<p class="muted small">
				Last 30 days · average {Math.round(
					avg(data.activity.steps.filter((d) => d.value > 0).map((d) => d.value))
				).toLocaleString()} on days with data
			</p>
			<BarChart
				label="Steps per day, last 30 days"
				unit="steps"
				formatY={(n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n)}`)}
				categories={data.activity.steps.map((d) => dayLabel(d.day))}
				series={[
					{
						key: 'steps',
						label: 'Steps',
						color: 'var(--chart)',
						values: data.activity.steps.map((d) => d.value)
					}
				]}
			/>
			<details>
				<summary>Show as table</summary>
				<table>
					<thead><tr><th>Day</th><th>Steps</th><th>Workout calories</th></tr></thead>
					<tbody>
						{#each [...data.activity.steps].reverse() as d, i (d.day)}
							{@const cal = data.activity.calories[data.activity.calories.length - 1 - i]}
							<tr>
								<td>{dayLabel(d.day)}</td>
								<td>{d.value ? d.value.toLocaleString() : '—'}</td>
								<td>{cal?.value ? cal.value.toLocaleString() : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</div>

		<div class="card focus">
			<h3 class="chart-title">Workout calories per day</h3>
			<p class="muted small">
				Last 30 days · calories burned in your watch workouts, as Samsung Health counts them
			</p>
			<BarChart
				label="Workout calories per day, last 30 days"
				unit="cal"
				formatY={(n) => `${Math.round(n).toLocaleString()}`}
				categories={data.activity.calories.map((d) => dayLabel(d.day))}
				series={[
					{
						key: 'calories',
						label: 'Workout calories',
						color: 'var(--chart)',
						values: data.activity.calories.map((d) => d.value)
					}
				]}
			/>
		</div>

		<div class="card focus span">
			<h3 class="chart-title">Workout minutes per week</h3>
			<p class="muted small">
				Last 12 weeks, from your watch. Lifting = strength or circuit sessions, plus unlabeled
				sessions that overlap a workout logged here.
			</p>
			<BarChart
				label="Workout minutes per week, lifting and cardio, last 12 weeks"
				formatY={(n) => `${Math.round(n)}`}
				categories={data.activity.weeks.map((w) => dayLabel(w.week))}
				series={[
					{
						key: 'lifting',
						label: 'Lifting',
						color: 'var(--chart-lift)',
						values: data.activity.weeks.map((w) => w.lifting)
					},
					{
						key: 'cardio',
						label: 'Cardio',
						color: 'var(--chart-cardio)',
						values: data.activity.weeks.map((w) => w.cardio)
					}
				]}
			/>
			<details>
				<summary>Show as table</summary>
				<table>
					<thead><tr><th>Week of</th><th>Lifting</th><th>Cardio</th><th>Total</th></tr></thead>
					<tbody>
						{#each [...data.activity.weeks].reverse() as w (w.week)}
							<tr>
								<td>{dayLabel(w.week)}</td>
								<td>{w.lifting} min</td>
								<td>{w.cardio} min</td>
								<td>{w.lifting + w.cardio} min</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</div>

		{#if data.activity.sessions.length}
			<div class="card span">
				<h3 class="chart-title">Watch sessions</h3>
				<ul class="sessions">
					{#each data.activity.sessions.slice(0, showAllSessions ? undefined : 10) as s (s.time.getTime())}
						<li>
							<span class="kind-dot {s.kind}" aria-hidden="true"></span>
							<span class="s-name">{s.name}</span>
							<span class="muted"
								>{dayLabel(s.day)} · {timeFmt.format(s.time)} · {s.minutes} min{s.miles
									? ` · ${s.miles} mi`
									: ''}{s.calories ? ` · ${s.calories} cal` : ''}</span
							>
							<span class="s-kind">{s.kind === 'lifting' ? 'Lifting' : 'Cardio'}</span>
							{#if s.id}
								<div class="s-remove">
									{#if confirmRemove === s.id}
										<form
											method="post"
											action="?/removeSession"
											use:enhance={() =>
												async ({ update }) => {
													await update({ reset: false });
													confirmRemove = null;
												}}
										>
											<input type="hidden" name="id" value={s.id} />
											<span
												>Remove this session? It won't count anywhere, even if your phone sends it
												again.</span
											>
											<button class="btn small danger">Remove</button>
											<button
												type="button"
												class="btn ghost small"
												onclick={() => (confirmRemove = null)}>Keep</button
											>
										</form>
									{:else}
										<button
											type="button"
											class="linkish"
											onclick={() => (confirmRemove = s.id ?? null)}
											>Remove<span class="sr-only"> {s.name} on {dayLabel(s.day)}</span></button
										>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if data.activity.sessions.length > 10}
					<button
						type="button"
						class="btn ghost small"
						onclick={() => (showAllSessions = !showAllSessions)}
					>
						{showAllSessions ? 'Show fewer' : `Show all ${data.activity.sessions.length}`}
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	section + section,
	.empty {
		margin-top: 20px;
	}

	h1 {
		font-size: 56px;
	}

	h2 {
		font-size: 28px;
		margin-bottom: 10px;
	}

	.small {
		font-size: 14px;
		margin: 0;
	}

	.records {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
	}

	.records li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 4px solid var(--chart);
	}

	.board {
		display: grid;
		gap: 16px;
		margin-top: 24px;
	}

	.board > section {
		margin-top: 0;
	}

	.focus {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.activity-head h2 {
		margin-bottom: 4px;
	}

	.picker {
		max-width: 420px;
	}

	.headline {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 32px;
	}

	.figure {
		margin: 2px 0 0;
		font: 600 28px/1.1 var(--body);
	}

	.chart-title {
		font: 600 17px/1.3 var(--body);
		margin: 4px 0 0;
	}

	@media (min-width: 800px) {
		.board {
			grid-template-columns: 1fr 1fr;
		}

		.span {
			grid-column: 1 / -1;
		}
	}

	.sessions {
		list-style: none;
		margin: 8px 0;
		padding: 0;
	}

	.sessions li {
		display: grid;
		grid-template-columns: 12px 1fr auto;
		grid-template-areas: 'dot name kind' '. meta meta' '. remove remove';
		align-items: center;
		gap: 2px 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}

	.sessions .muted {
		grid-area: meta;
		font-size: 14px;
	}

	.s-name {
		grid-area: name;
		font-weight: 600;
	}

	.s-kind {
		grid-area: kind;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}

	.s-remove {
		grid-area: remove;
	}

	.s-remove form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}

	.linkish {
		background: none;
		border: none;
		padding: 0;
		min-height: 32px;
		font: inherit;
		font-size: 14px;
		color: var(--ink-2);
		text-decoration: underline;
		cursor: pointer;
	}

	.danger {
		--accent: var(--danger);
	}

	.kind-dot {
		grid-area: dot;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.kind-dot.lifting {
		background: var(--chart-lift);
	}

	.kind-dot.cardio {
		background: var(--chart-cardio);
	}

	.single {
		margin: 0;
		padding: 24px 16px;
		border: 1.5px dashed var(--line);
		border-radius: var(--radius);
		text-align: center;
	}

	details summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 40px;
		display: flex;
		align-items: center;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		text-align: left;
		padding: 8px 6px;
		border-bottom: 1px solid var(--line);
	}

	th {
		font-size: 13px;
		color: var(--ink-2);
		font-weight: 600;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.list button {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 12px;
		align-items: center;
		width: 100%;
		min-height: 52px;
		padding: 8px 4px;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.list button[aria-pressed='true'] .name {
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}

	.name {
		font-weight: 600;
	}

	.delta {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		min-width: 52px;
		text-align: right;
	}

	@media (max-width: 480px) {
		.list button {
			grid-template-columns: 1fr auto;
		}
		.list .muted {
			grid-column: 1;
			grid-row: 2;
			font-size: 14px;
		}
	}
</style>
