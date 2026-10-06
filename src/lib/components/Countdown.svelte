<script lang="ts">
	import { beep, setSoundEnabled, soundEnabled, unlockAudio } from '#lib/alert-sound.ts';

	interface Props {
		label: string;
		seconds: number;
		/** Changing this restarts the countdown. */
		startKey: number;
		ondone?: () => void;
		onclose: () => void;
	}

	let { label, seconds, startKey, ondone, onclose }: Props = $props();

	let endAt = $state(0);
	let sound = $state(soundEnabled());
	let now = $state(Date.now());

	$effect(() => {
		void startKey;
		endAt = Date.now() + seconds * 1000;
	});

	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(id);
	});

	const remaining = $derived(Math.max(0, Math.ceil((endAt - now) / 1000)));
	const done = $derived(endAt > 0 && remaining === 0);

	$effect(() => {
		if (!done) return;
		navigator.vibrate?.([200, 100, 200]);
		beep();
		ondone?.();
	});

	function fmt(s: number) {
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<div class="timer" class:done role="timer" aria-live={done ? 'assertive' : 'off'}>
	<span class="label">{done ? `${label} done` : label}</span>
	<span class="time">{fmt(remaining)}</span>
	<div class="actions">
		<button
			type="button"
			class="btn ghost small sound"
			aria-pressed={sound}
			aria-label={sound ? 'Timer sound on' : 'Timer sound off'}
			onclick={() => {
				sound = !sound;
				setSoundEnabled(sound);
				if (sound) unlockAudio();
			}}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M4 9v6h4l5 4V5L8 9z" />
				{#if sound}<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />{:else}<path
						d="M17 9l5 6M22 9l-5 6"
					/>{/if}
			</svg>
		</button>
		{#if !done}
			<button type="button" class="btn ghost small" onclick={() => (endAt += 30_000)}>+30s</button>
		{/if}
		<button type="button" class="btn small" onclick={onclose}>{done ? 'OK' : 'Skip'}</button>
	</div>
</div>

<style>
	.timer {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--ink);
		color: var(--paper);
		--accent: var(--paper);
		--on-accent: var(--ink);
	}

	.timer.done {
		background: var(--good);
	}

	.label {
		font-weight: 600;
	}

	.time {
		font: 800 36px/1 var(--display);
		font-variant-numeric: tabular-nums;
	}

	.sound svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}
</style>
