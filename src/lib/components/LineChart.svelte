<script lang="ts">
	interface Point {
		date: Date;
		value: number;
		/** Tooltip lines: first is the headline value, the rest are detail. */
		lines: string[];
		/** Marked with a ringed dot and a "PR" label. */
		highlight?: boolean;
	}

	interface Props {
		points: Point[];
		/** Accessible name, e.g. "Goblet squat, estimated max over time". */
		label: string;
		formatY: (n: number) => string;
		height?: number;
	}

	let { points, label, formatY, height = 220 }: Props = $props();

	let width = $state(600);
	let active = $state<number | null>(null);

	const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

	/** Clean tick values (1, 2, 2.5, 5 × 10ⁿ) covering the data. */
	const ticks = $derived.by(() => {
		const values = points.map((p) => p.value);
		let lo = Math.min(...values);
		let hi = Math.max(...values);
		if (lo === hi) {
			lo -= 1;
			hi += 1;
		}
		const raw = (hi - lo) / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => raw <= s)!;
		const start = Math.floor(lo / step) * step;
		const end = Math.ceil(hi / step) * step;
		const out: number[] = [];
		for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(6)));
		return out;
	});

	const pad = $derived.by(() => {
		const widest = Math.max(2, ...ticks.map((t) => formatY(t).length));
		return { top: 22, right: 8, bottom: 26, left: Math.ceil(widest * 8 + 16) };
	});

	const plotW = $derived(Math.max(1, width - pad.left - pad.right));
	const plotH = $derived(height - pad.top - pad.bottom);
	const t0 = $derived(points[0].date.getTime());
	const t1 = $derived(points.at(-1)!.date.getTime());

	const x = (d: Date) =>
		pad.left + (t1 === t0 ? plotW / 2 : ((d.getTime() - t0) / (t1 - t0)) * plotW);
	const y = (v: number) => pad.top + plotH - ((v - ticks[0]) / (ticks.at(-1)! - ticks[0])) * plotH;

	const coords = $derived(points.map((p) => ({ cx: x(p.date), cy: y(p.value) })));
	const linePath = $derived(coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx},${c.cy}`).join(' '));
	const areaPath = $derived(
		coords.length > 1
			? `${linePath} L${coords.at(-1)!.cx},${pad.top + plotH} L${coords[0].cx},${pad.top + plotH} Z`
			: ''
	);

	function nearest(clientX: number, rect: DOMRect) {
		const px = ((clientX - rect.left) / rect.width) * width;
		let best = 0;
		coords.forEach((c, i) => {
			if (Math.abs(c.cx - px) < Math.abs(coords[best].cx - px)) best = i;
		});
		return best;
	}

	function onKey(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		e.preventDefault();
		const last = points.length - 1;
		const cur = active ?? last;
		active =
			e.key === 'Home'
				? 0
				: e.key === 'End'
					? last
					: Math.max(0, Math.min(last, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
	}

	/** First, last, and the middle date when it won't collide with either end. */
	const xLabels = $derived.by(() => {
		if (!points.length) return [];
		const idxs = [0];
		if (points.length > 2) {
			const mid = Math.floor((points.length - 1) / 2);
			const midX = coords[mid].cx;
			if (midX - coords[0].cx > 72 && coords.at(-1)!.cx - midX > 72) idxs.push(mid);
		}
		if (points.length > 1) idxs.push(points.length - 1);
		return idxs;
	});

	const showDot = (i: number) =>
		points[i].highlight ||
		active === i ||
		i === 0 ||
		i === points.length - 1 ||
		points.length <= 14;

	const valueText = $derived.by(() => {
		const p = points[active ?? points.length - 1];
		return `${dateFmt.format(p.date)}: ${p.lines.join(', ')}${p.highlight ? ', personal record' : ''}`;
	});

	const current = $derived(points[active ?? points.length - 1]);
	const tip = $derived(active === null ? null : coords[active]);
</script>

<div class="chart" bind:clientWidth={width}>
	<div class="readout" aria-hidden="true">
		<strong>{current.lines[0]}</strong>
		{#each current.lines.slice(1) as line (line)}<span>{line}</span>{/each}
		<span class="date"
			>{dateFmt.format(current.date)}{current.highlight ? ' · personal record' : ''}</span
		>
	</div>
	<svg
		viewBox="0 0 {width} {height}"
		{height}
		role="slider"
		aria-label="{label}. Use the arrow keys to read each point."
		aria-valuemin={0}
		aria-valuemax={points.length - 1}
		aria-valuenow={active ?? points.length - 1}
		aria-valuetext={valueText}
		tabindex="0"
		onpointermove={(e) => (active = nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
		onpointerleave={() => (active = null)}
		onfocus={() => (active = points.length - 1)}
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
				x={coords[i].cx}
				y={height - 6}
				text-anchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
				>{dateFmt.format(points[i].date)}</text
			>
		{/each}
		{#if points.length > 1}
			<path class="area" d={areaPath} />
			<path class="line" d={linePath} />
		{/if}

		{#if tip}
			<line class="crosshair" x1={tip.cx} x2={tip.cx} y1={pad.top} y2={pad.top + plotH} />
		{/if}

		{#each coords as c, i (i)}
			{#if showDot(i)}
				<circle
					class="dot"
					class:pr={points[i].highlight}
					cx={c.cx}
					cy={c.cy}
					r={points[i].highlight ? 6 : active === i ? 5 : 4}
				/>
			{/if}
			{#if points[i].highlight}
				<text class="pr-label" x={c.cx} y={c.cy - 12} text-anchor="middle">PR</text>
			{/if}
		{/each}
	</svg>
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

	.area {
		fill: var(--chart);
		opacity: 0.1;
	}

	.line {
		fill: none;
		stroke: var(--chart);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.dot {
		fill: var(--chart);
		stroke: var(--paper);
		stroke-width: 2;
	}

	.dot.pr {
		fill: var(--paper);
		stroke: var(--chart);
		stroke-width: 3;
	}

	.pr-label {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 600;
	}

	.crosshair {
		stroke: var(--ink-2);
		stroke-width: 1;
	}

	.readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		min-height: 32px;
		margin-bottom: 4px;
		font-variant-numeric: tabular-nums;
	}

	.readout strong {
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.date {
		color: var(--ink-2);
		font-size: 14px;
	}
</style>
