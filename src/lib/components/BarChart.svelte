<script lang="ts">
	interface Series {
		key: string;
		label: string;
		/** A CSS color, e.g. "var(--chart-lift)". */
		color: string;
		values: number[];
	}

	interface Props {
		/** One label per column, e.g. "Oct 6". */
		categories: string[];
		/** One or more series; several are stacked, the first at the bottom. */
		series: Series[];
		/** Accessible name, e.g. "Steps per day, last 30 days". */
		label: string;
		formatY: (n: number) => string;
		/** Unit after values in the tooltip, e.g. "steps". */
		unit?: string;
		height?: number;
	}

	let { categories, series, label, formatY, unit = '', height = 200 }: Props = $props();

	let width = $state(600);
	let active = $state<number | null>(null);

	const pad = { top: 12, right: 8, bottom: 26, left: 52 };
	const GAP = 2;
	const RADIUS = 4;

	const totals = $derived(
		categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
	);

	/** Clean ticks (1, 2, 2.5, 5 × 10ⁿ) from 0 to just above the tallest column. */
	const ticks = $derived.by(() => {
		const max = Math.max(1, ...totals);
		const raw = max / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => raw <= s)!;
		const out: number[] = [];
		for (let v = 0; v <= max + step * 0.999; v += step) out.push(Number(v.toFixed(6)));
		return out;
	});

	const plotW = $derived(Math.max(1, width - pad.left - pad.right));
	const plotH = $derived(height - pad.top - pad.bottom);
	const band = $derived(plotW / Math.max(1, categories.length));
	const barW = $derived(Math.max(2, Math.min(24, band * 0.7)));
	const top = $derived(ticks.at(-1)!);
	const y = (v: number) => pad.top + plotH - (v / top) * plotH;
	const bandX = (i: number) => pad.left + i * band;

	/** Rect with only the top corners rounded (square at the baseline). */
	function topRounded(x: number, yTop: number, w: number, h: number, r: number) {
		const rr = Math.min(r, h, w / 2);
		return `M${x},${yTop + h} L${x},${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} L${x + w - rr},${yTop} Q${x + w},${yTop} ${x + w},${yTop + rr} L${x + w},${yTop + h} Z`;
	}

	/** Stacked segments for column i, bottom to top, with a gap between touching segments. */
	function segments(i: number) {
		const out: { key: string; color: string; d: string }[] = [];
		let base = 0;
		const filled = series.filter((s) => (s.values[i] ?? 0) > 0);
		filled.forEach((s, n) => {
			const v = s.values[i];
			const yBottom = y(base) - (n > 0 ? GAP : 0);
			const yTop = y(base + v);
			const h = Math.max(0, yBottom - yTop);
			const x = bandX(i) + (band - barW) / 2;
			const isTop = n === filled.length - 1;
			out.push({
				key: s.key,
				color: s.color,
				d: isTop ? topRounded(x, yTop, barW, h, RADIUS) : `M${x},${yTop} h${barW} v${h} h${-barW} Z`
			});
			base += v;
		});
		return out;
	}

	/** First, middle and last labels: enough to orient without crowding. */
	const xLabels = $derived(
		[...new Set([0, Math.floor((categories.length - 1) / 2), categories.length - 1])].filter(
			(i) => i >= 0
		)
	);

	function describe(i: number) {
		const parts = series.map((s) => `${s.label} ${formatY(s.values[i] ?? 0)}`);
		return `${categories[i]}: ${series.length > 1 ? `${parts.join(', ')}, total ${formatY(totals[i])}` : `${formatY(totals[i])} ${unit}`.trim()}`;
	}

	function onKey(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		e.preventDefault();
		const last = categories.length - 1;
		const cur = active ?? last;
		active =
			e.key === 'Home'
				? 0
				: e.key === 'End'
					? last
					: Math.max(0, Math.min(last, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
	}

	function fromPointer(e: PointerEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * width;
		const i = Math.floor((px - pad.left) / band);
		active = i >= 0 && i < categories.length ? i : null;
	}
</script>

{#if series.length > 1}
	<ul class="legend">
		{#each series as s (s.key)}
			<li><span class="swatch" style:background={s.color} aria-hidden="true"></span>{s.label}</li>
		{/each}
	</ul>
{/if}

<div class="chart" bind:clientWidth={width}>
	<svg
		viewBox="0 0 {width} {height}"
		{height}
		role="slider"
		tabindex="0"
		aria-label="{label}. Use the arrow keys to read each column."
		aria-valuemin={0}
		aria-valuemax={categories.length - 1}
		aria-valuenow={active ?? categories.length - 1}
		aria-valuetext={describe(active ?? categories.length - 1)}
		onpointermove={fromPointer}
		onpointerleave={() => (active = null)}
		onfocus={() => (active = categories.length - 1)}
		onblur={() => (active = null)}
		onkeydown={onKey}
	>
		{#each ticks as t (t)}
			<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
			<text class="axis" x={pad.left - 8} y={y(t)} text-anchor="end" dominant-baseline="middle"
				>{formatY(t)}</text
			>
		{/each}

		{#if active !== null}
			<rect class="hover" x={bandX(active)} y={pad.top} width={band} height={plotH} />
		{/if}

		{#each categories.keys() as i (i)}
			{#each segments(i) as seg (seg.key)}
				<path d={seg.d} style:fill={seg.color} />
			{/each}
		{/each}

		{#each xLabels as i (i)}
			<text
				class="axis"
				x={bandX(i) + band / 2}
				y={height - 8}
				text-anchor={i === 0 ? 'start' : i === categories.length - 1 ? 'end' : 'middle'}
				>{categories[i]}</text
			>
		{/each}
	</svg>

	{#if active !== null}
		<div
			class="tooltip"
			class:flip={bandX(active) > width * 0.6}
			style:left="{((bandX(active) + band / 2) / width) * 100}%"
			aria-hidden="true"
		>
			<span class="date">{categories[active]}</span>
			{#if series.length > 1}
				{#each series as s (s.key)}
					<span class="row"
						><span class="swatch" style:background={s.color}></span><strong
							>{formatY(s.values[active] ?? 0)}</strong
						>
						{s.label}</span
					>
				{/each}
				<span class="row total">{formatY(totals[active])} total</span>
			{:else}
				<strong>{formatY(totals[active])} {unit}</strong>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
	}

	svg {
		display: block;
		width: 100%;
		overflow: visible;
		touch-action: pan-y;
	}

	svg:focus-visible {
		outline: 3px solid var(--chart);
		outline-offset: 4px;
		border-radius: 4px;
	}

	.grid {
		stroke: var(--line);
		stroke-width: 1;
		opacity: 0.6;
	}

	.axis {
		fill: var(--ink-2);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.hover {
		fill: var(--ink);
		opacity: 0.06;
	}

	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 0 0 8px;
		padding: 0;
		font-size: 14px;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.tooltip {
		position: absolute;
		top: 4px;
		transform: translateX(10px);
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 120px;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--panel);
		border: 1px solid var(--line);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.12);
		font-size: 13px;
		pointer-events: none;
		white-space: nowrap;
	}

	.tooltip.flip {
		transform: translateX(calc(-100% - 10px));
	}

	.tooltip strong {
		font-size: 15px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.total,
	.date {
		color: var(--ink-2);
	}
</style>
