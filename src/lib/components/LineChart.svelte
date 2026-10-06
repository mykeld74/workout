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

	const pad = { top: 22, right: 16, bottom: 28, left: 52 };
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

	const valueText = $derived.by(() => {
		const p = points[active ?? points.length - 1];
		return `${dateFmt.format(p.date)}: ${p.lines.join(', ')}${p.highlight ? ', personal record' : ''}`;
	});

	const tip = $derived(active === null ? null : { ...points[active], ...coords[active] });
</script>

<div class="chart" bind:clientWidth={width}>
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
		<text class="axis" x={coords[0].cx} y={height - 8} text-anchor="start"
			>{dateFmt.format(points[0].date)}</text
		>
		{#if points.length > 1}
			<text class="axis" x={coords.at(-1)!.cx} y={height - 8} text-anchor="end"
				>{dateFmt.format(points.at(-1)!.date)}</text
			>
			<path class="area" d={areaPath} />
			<path class="line" d={linePath} />
		{/if}

		{#if tip}
			<line class="crosshair" x1={tip.cx} x2={tip.cx} y1={pad.top} y2={pad.top + plotH} />
		{/if}

		{#each coords as c, i (i)}
			<circle
				class="dot"
				class:pr={points[i].highlight}
				cx={c.cx}
				cy={c.cy}
				r={points[i].highlight ? 6 : 4}
			/>
			{#if points[i].highlight}
				<text class="pr-label" x={c.cx} y={c.cy - 12} text-anchor="middle">PR</text>
			{/if}
		{/each}
	</svg>

	{#if tip}
		<div
			class="tooltip"
			style:left="{(tip.cx / width) * 100}%"
			style:top="{tip.cy}px"
			class:flip={tip.cx > width * 0.65}
			aria-hidden="true"
		>
			<strong>{tip.lines[0]}</strong>
			{#each tip.lines.slice(1) as line (line)}<span>{line}</span>{/each}
			<span class="date">{dateFmt.format(tip.date)}{tip.highlight ? ' · personal record' : ''}</span
			>
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

	.tooltip {
		position: absolute;
		transform: translate(12px, -50%);
		display: flex;
		flex-direction: column;
		gap: 2px;
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
		transform: translate(calc(-100% - 12px), -50%);
	}

	.tooltip strong {
		font-size: 15px;
	}

	.date {
		color: var(--ink-2);
	}
</style>
