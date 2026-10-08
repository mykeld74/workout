<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ExerciseCues from '#lib/components/ExerciseCues.svelte';
	import { EQUIPMENT, PATTERNS, type Equipment, type Pattern } from '#lib/workout/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let importing = $state(false);
	let saving = $state<string | null>(null);

	/** A form action that keeps the current search and filters, e.g. "?q=curl&/pref". */
	const action = (name: string) => {
		const query = page.url.searchParams.toString();
		return `?${query ? `${query}&` : ''}/${name}`;
	};

	const favorites = $derived(new Set(data.favorites));
	const hidden = $derived(new Set(data.hidden));

	const SOURCE_LABELS: Record<string, string> = {
		sheet: 'Your sheets',
		starter: 'Starters',
		'free-exercise-db': 'Free Exercise DB'
	};

	const total = $derived(data.sources.reduce((n, s) => n + s.count, 0));
	const hasImported = $derived(data.sources.some((s) => s.source === 'free-exercise-db'));
</script>

<section>
	<p class="kicker">{total} exercises in your database</p>
	<h1>Exercises</h1>
	<p class="muted">
		The generator picks from everything here that fits your equipment and age. Starred exercises get
		picked more often; hidden ones never. {#each data.sources as s, i (s.source)}{i
				? ' · '
				: ''}{SOURCE_LABELS[s.source] ?? s.source}: {s.count}{/each}
	</p>
</section>

<section class="card import">
	<div>
		<h2>{hasImported ? 'Check for new exercises' : 'Add more exercises'}</h2>
		<p class="muted">
			Pulls ~800 strength and stretching exercises from the open-source
			<a href="https://github.com/yuhonas/free-exercise-db" rel="noreferrer" target="_blank"
				>Free Exercise DB</a
			>, with instructions and photos. New plans and swaps will start using them.
		</p>
	</div>
	<form
		method="post"
		action={action('import')}
		use:enhance={() => {
			importing = true;
			return async ({ update }) => {
				await update();
				importing = false;
			};
		}}
	>
		<button class="btn" disabled={importing}>{importing ? 'Importing…' : 'Import'}</button>
	</form>
	{#if form?.imported}
		<p class="ok" role="status">Added {form.imported.added} exercises.</p>
	{:else if form?.importError}
		<p class="error" role="alert">{form.importError}</p>
	{/if}
</section>

<form class="filters" method="get" data-sveltekit-keepfocus>
	<label class="search">
		Search
		<input name="q" type="search" value={data.filters.q} placeholder="e.g. row, lunge" />
	</label>
	<label>
		Movement
		<select name="pattern" value={data.filters.pattern}>
			<option value="">All</option>
			{#each Object.entries(PATTERNS) as [value, label] (value)}<option {value}>{label}</option
				>{/each}
		</select>
	</label>
	<label>
		Source
		<select name="source" value={data.filters.source}>
			<option value="">All</option>
			{#each Object.entries(SOURCE_LABELS) as [value, label] (value)}<option {value}>{label}</option
				>{/each}
		</select>
	</label>
	<label>
		Show
		<select name="show" value={data.filters.show}>
			<option value="">All except hidden</option>
			<option value="favorites">Starred ({data.favorites.length})</option>
			<option value="hidden">Hidden ({data.hidden.length})</option>
		</select>
	</label>
	<label>
		Equipment
		<select name="mine" value={data.filters.mine ? '1' : '0'}>
			<option value="1">Fits my gear</option>
			<option value="0">Any</option>
		</select>
	</label>
	<button class="btn">Filter</button>
</form>

<p class="muted count">
	{data.total} match{data.total === 1 ? '' : 'es'}{data.total > data.rows.length
		? ` · showing first ${data.rows.length}`
		: ''}
</p>

<ul class="results">
	{#each data.rows as ex (ex.id)}
		<li class="card">
			<div class="head">
				<h3>{ex.name}</h3>
				<span class="pill">{PATTERNS[ex.pattern as Pattern] ?? ex.pattern}</span>
			</div>
			<form
				class="prefs"
				method="post"
				action={action('pref')}
				use:enhance={() => {
					saving = ex.id;
					return async ({ update }) => {
						await update({ reset: false });
						saving = null;
					};
				}}
			>
				<input type="hidden" name="exerciseId" value={ex.id} />
				<button
					class="pref"
					class:on={favorites.has(ex.id)}
					name="status"
					value={favorites.has(ex.id) ? '' : 'favorite'}
					aria-pressed={favorites.has(ex.id)}
					disabled={saving === ex.id}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path
							d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
						/></svg
					>
					{favorites.has(ex.id) ? 'Starred' : 'Star'}<span class="sr-only"> {ex.name}</span>
				</button>
				<button
					class="pref"
					class:on={hidden.has(ex.id)}
					name="status"
					value={hidden.has(ex.id) ? '' : 'hidden'}
					aria-pressed={hidden.has(ex.id)}
					disabled={saving === ex.id}
				>
					{hidden.has(ex.id) ? 'Unhide' : 'Never show'}<span class="sr-only"> {ex.name}</span>
				</button>
			</form>
			<p class="meta muted">
				{ex.equipment.length
					? ex.equipment.map((e) => EQUIPMENT[e as Equipment] ?? e).join(', ')
					: 'Bodyweight'} · {ex.level}{ex.jointStress !== 'low'
					? ` · ${ex.jointStress} joint load`
					: ''}
			</p>
			<ExerciseCues exercise={ex} />
		</li>
	{:else}
		<li class="muted">Nothing matches. Try “Any” equipment or import more exercises.</li>
	{/each}
</ul>

<style>
	section + section {
		margin-top: 16px;
	}

	h1 {
		font-size: var(--h1);
	}

	h2 {
		font-size: var(--h2);
	}

	.import {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px 16px;
		align-items: center;
	}

	.import p {
		margin: 6px 0 0;
		font-size: 15px;
	}

	.import .ok,
	.import .error {
		grid-column: 1 / -1;
		margin: 0;
	}

	.ok {
		color: var(--good);
		font-weight: 600;
	}

	.filters {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
		gap: 10px;
		align-items: end;
		margin-top: 24px;
	}

	.count {
		margin: 12px 0 8px;
		font-size: 15px;
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 10px;
	}

	h3 {
		font: 600 18px/1.25 var(--body);
	}

	.pill {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--wash);
	}

	.prefs {
		display: flex;
		gap: 6px;
		margin: 6px 0 4px;
	}

	.pref {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink-2);
		font: 600 14px/1 var(--body);
		cursor: pointer;
	}

	.pref.on {
		border-color: var(--lime);
		color: var(--lime);
		background: var(--wash);
	}

	.pref svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.pref.on svg {
		fill: currentColor;
	}

	.meta {
		margin: 2px 0 6px;
		font-size: 14px;
	}

	@media (max-width: 640px) {
		.import {
			grid-template-columns: 1fr;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
		}
		.filters .search,
		.filters .btn {
			grid-column: 1 / -1;
		}
	}
</style>
