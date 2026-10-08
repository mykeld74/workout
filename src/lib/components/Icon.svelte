<script lang="ts" module>
	// Outline icons from Tabler Icons (MIT, https://tabler.io/icons), 24×24 grid.
	const PATHS = {
		home: [
			'M5 12l-2 0l9 -9l9 9l-2 0',
			'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7',
			'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6'
		],
		chart: ['M4 19l16 0', 'M4 15l4 -6l4 2l4 -5l4 4'],
		barbell: [
			'M2 12h1',
			'M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2',
			'M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1',
			'M9 12h6',
			'M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1',
			'M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2',
			'M22 12h-1'
		],
		user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
		logout: [
			'M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2',
			'M9 12h12l-3 -3',
			'M18 15l3 -3'
		],
		activity: ['M3 12h4l3 8l4 -16l3 8h4'],
		play: ['M7 4v16l13 -8z'],
		check: ['M5 12l5 5l10 -10'],
		plus: ['M12 5l0 14', 'M5 12l14 0'],
		chevronLeft: ['M15 6l-6 6l6 6'],
		chevronRight: ['M9 6l6 6l-6 6'],
		clock: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
		flame: [
			'M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.621 -2.333 5.588c0 3.704 3.134 6.706 7 6.706s7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235'
		]
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		/** Accessible name; omit for decorative icons next to visible text. */
		label?: string;
	}

	let { name, size = 22, label }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
