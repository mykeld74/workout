<script lang="ts">
	interface Series {
		key: string;
		label: string;
		/** A CSS color, e.g. "var(--chart-lift)". */
		color: string;
		values: number[];
	}

	interface Props {
		/** One label per point, shared by every series. */
		categories: string[];
		series: Series[];
		/** Accessible name, e.g. "Workout minutes per week". */
		label: string;
		formatY: (n: number) => string;
		/** Unit after values in the readout, e.g. "min". */
		unit?: string;
		height?: number;
	}

	let { categories, series, label, formatY, unit = '', height = 220 }: Props = $props();

	let width = $state(600);
	let active = $state<number | null>(null);

	const peak = $derived(Math.max(1, ...series.flatMap((s) => s.values)));

	/** Clean ticks (1, 2, 2.5, 5 × 10ⁿ) from 0 to just above the highest point. */
	const ticks = $derived.by(() => {
		const raw = peak / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => raw <= s)!;
		const out: number[] = [];
		for (let v = 0; v <= peak + step * 0.999; v += step) out.push(Number(v.toFixed(6)));
		return out;
	});

	const pad = $derived.by(() => {
		const widest = Math.max(2, ...ticks.map((t) => formatY(t).length));
		return { top: 12, right: 8, bottom: 26, left: Math.ceil(widest * 8 + 16) };
	});

	const plotW = $derived(Math.max(1, width - pad.left - pad.right));
	const plotH = $derived(height - pad.top - pad.bottom);
	const top = $derived(ticks.at(-1)!);
	const y = (v: number) => pad.top + plotH - (v / top) * plotH;
	const cx = (i: number) =>
		pad.left + (categories.length <= 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);

	function linePath(values: number[]) {
		return values
			.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`)
			.join(' ');
	}

	/** As many date labels as fit, always including the first and last. */
	const xLabels = $derived.by(() => {
		const n = categories.length;
		if (n <= 1) return n ? [0] : [];
		const longest = Math.max(...categories.map((c) => c.length));
		const gap = Math.max(64, longest * 7 + 18);
		const count = Math.max(2, Math.min(n, Math.floor(plotW / gap) + 1));
		const idxs: number[] = [];
		for (let k = 0; k < count; k++) {
			const i = Math.round((k * (n - 1)) / (count - 1));
			if (idxs.at(-1) !== i) idxs.push(i);
		}
		return idxs;
	});

	const shown = $derived(active ?? Math.max(0, categories.length - 1));

	const showDot = (i: number) =>
		active === i || i === 0 || i === categories.length - 1 || categories.length <= 16;

	function describe(i: number) {
		const parts = series.map((s) => `${s.label} ${formatY(s.values[i] ?? 0)} ${unit}`.trim());
		return `${categories[i]}: ${parts.join(', ')}`;
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
		if (categories.length <= 1) {
			active = 0;
			return;
		}
		const i = Math.round(((px - pad.left) / plotW) * (categories.length - 1));
		active = i >= 0 && i < categories.length ? i : null;
	}
</script>

<div class="chart" bind:clientWidth={width}>
	<div class="readout" aria-hidden="true">
		<span class="date">{categories[shown]}</span>
		{#each series as s (s.key)}
			<span class="row">
				<span class="swatch" style:background={s.color}></span>
				<strong>{formatY(s.values[shown] ?? 0)}</strong>
				{#if unit}<span class="unit">{unit}</span>{/if}
				<span class="name">{s.label}</span>
			</span>
		{/each}
	</div>
	<svg
		viewBox="0 0 {width} {height}"
		{height}
		role="slider"
		aria-label="{label}. Use the arrow keys to read each point."
		aria-valuemin={0}
		aria-valuemax={Math.max(0, categories.length - 1)}
		aria-valuenow={shown}
		aria-valuetext={describe(shown)}
		tabindex="0"
		onpointermove={fromPointer}
		onpointerleave={() => (active = null)}
		onfocus={() => (active = Math.max(0, categories.length - 1))}
		onblur={() => (active = null)}
		onkeydown={onKey}
	>
		{#each ticks as t (t)}
			<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
			<text class="axis" x={pad.left - 8} y={y(t)} text-anchor="end" dominant-baseline="middle"
				>{formatY(t)}</text
			>
		{/each}
		{#each xLabels as i (i)}
			<text
				class="axis"
				x={cx(i)}
				y={height - 6}
				text-anchor={i === 0 ? 'start' : i === categories.length - 1 ? 'end' : 'middle'}
				>{categories[i]}</text
			>
		{/each}
		{#each series as s (s.key)}
			{#if s.values.length > 1}
				<path class="line" d={linePath(s.values)} style:stroke={s.color} />
			{/if}
		{/each}
		{#if active !== null}
			<line class="crosshair" x1={cx(shown)} x2={cx(shown)} y1={pad.top} y2={pad.top + plotH} />
		{/if}
		{#each series as s (s.key)}
			{#each s.values as v, i (i)}
				{#if showDot(i)}
					<circle
						cx={cx(i)}
						cy={y(v)}
						r={active === i ? 5 : 3.5}
						style:fill={s.color}
						stroke="var(--paper)"
						stroke-width="2"
					/>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.chart {
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

	.line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.crosshair {
		stroke: var(--ink-2);
		stroke-width: 1;
	}

	.readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 16px;
		min-height: 32px;
		margin-bottom: 4px;
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		align-self: center;
	}

	.readout strong {
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.unit,
	.name,
	.date {
		color: var(--ink-2);
		font-size: 14px;
	}
</style>
