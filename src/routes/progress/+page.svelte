<script lang="ts">
	import LineChart from '#lib/components/LineChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let selectedId = $state<string | null>(null);
	const selected = $derived(
		data.exercises.find((e) => e.id === selectedId) ?? data.exercises[0] ?? null
	);

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

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

{#if !data.exercises.length}
	<p class="card empty">
		Finish a workout with a few logged sets and your progress shows up here: best sets, personal
		records and body weight over time.
	</p>
{:else}
	{#if records.length}
		<section>
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
		<section class="card focus">
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
				<p class="muted single">Logged once so far. Do it again and your trend line starts here.</p>
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

	<section>
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
						{#if pct !== null}<span class="delta">{pct >= 0 ? '+' : '−'}{Math.abs(pct)}%</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="card focus">
	<h2 class="chart-title">Body weight</h2>
	{#if data.bodyWeight.length >= 2}
		<LineChart
			label="Body weight over time"
			formatY={(n) => `${Math.round(n)}`}
			points={data.bodyWeight.map((b) => ({
				date: b.date,
				value: b.weight,
				lines: [
					`${b.weight} lb`,
					b.source === 'samsung' ? 'From Samsung Health' : 'Entered after a workout'
				]
			}))}
		/>
		<details>
			<summary>Show as table</summary>
			<table>
				<thead><tr><th>Date</th><th>Body weight</th><th>Source</th></tr></thead>
				<tbody>
					{#each [...data.bodyWeight].reverse() as b (b.date.getTime())}
						<tr>
							<td>{dateFmt.format(b.date)}</td>
							<td>{b.weight} lb</td>
							<td>{b.source === 'samsung' ? 'Samsung Health' : 'Workout'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{:else}
		<p class="muted">
			Add your body weight when you finish a workout, or <a href="/health">connect Samsung Health</a
			>
			({data.bodyWeight.length} so far). The trend appears after two entries.
		</p>
	{/if}
</section>

{#each [{ title: 'Resting heart rate', unit: 'bpm', rows: data.restingHr, note: 'Lower over time usually means better fitness.' }, { title: 'Heart rate variability', unit: 'ms', rows: data.hrv, note: 'Higher usually means better recovered.' }] as m (m.title)}
	{#if m.rows.length >= 2}
		<section class="card focus">
			<h2 class="chart-title">{m.title} ({m.unit})</h2>
			<p class="muted small">{m.note} From your Galaxy Watch, one value per day.</p>
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

	.focus {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
