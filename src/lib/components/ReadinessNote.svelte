<script lang="ts">
	interface Props {
		readiness: {
			status: 'good' | 'easy' | 'unknown';
			message: string;
		} | null;
		/** Only show when it suggests going easier (the workout screen). */
		onlyWhenEasy?: boolean;
	}

	let { readiness, onlyWhenEasy = false }: Props = $props();
	const show = $derived(
		!!readiness && readiness.status !== 'unknown' && (!onlyWhenEasy || readiness.status === 'easy')
	);
</script>

{#if show && readiness}
	<p class="note" class:easy={readiness.status === 'easy'} role="note">
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
		<span
			><strong>{readiness.status === 'easy' ? 'Take it easier today.' : 'Ready to train.'}</strong>
			{readiness.message}</span
		>
	</p>
{/if}

<style>
	.note {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin: 16px 0 0;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--wash);
		font-size: 15px;
	}

	.note.easy {
		border: 1.5px solid var(--ink);
	}

	svg {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
