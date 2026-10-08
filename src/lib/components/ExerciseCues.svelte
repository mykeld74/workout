<script lang="ts">
	interface Props {
		exercise: {
			name: string;
			cues: string[];
			instructions: string[];
			images: string[];
			imagesApprox: boolean;
		};
		/** Fold everything into a closed "How to do it" accordion (workout screen, to keep inputs in view). */
		collapsible?: boolean;
	}

	let { exercise, collapsible = false }: Props = $props();

	const videoUrl = $derived(
		`https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${exercise.name} exercise`)}`
	);
</script>

{#snippet details()}
	{#if exercise.images.length}
		<figure>
			<div class="frames">
				{#each exercise.images.slice(0, 2) as src, i (src)}
					<div class="frame">
						<img
							{src}
							alt="{exercise.name}, {i === 0 ? 'start' : 'finish'} position"
							loading="lazy"
							decoding="async"
						/>
						<span>{i === 0 ? 'Start' : 'Finish'}</span>
					</div>
				{/each}
			</div>
			{#if exercise.imagesApprox}
				<figcaption class="muted">Photos show a close variation. Follow the cues below.</figcaption>
			{/if}
		</figure>
	{/if}

	{#if exercise.cues.length}
		<ul class="cues">
			{#each exercise.cues as cue (cue)}<li>{cue}</li>{/each}
		</ul>
	{/if}

	<div class="extras">
		<a class="btn ghost small" href={videoUrl} target="_blank" rel="noreferrer">
			▶ Watch video<span class="sr-only"> of {exercise.name} (opens YouTube)</span>
		</a>
		{#if exercise.instructions.length}
			<details>
				<summary>Step-by-step</summary>
				<ol>
					{#each exercise.instructions as step, i (i)}<li>{step}</li>{/each}
				</ol>
			</details>
		{/if}
	</div>
{/snippet}

{#if collapsible}
	<details class="howto">
		<summary>How to do it{exercise.images.length ? ' · photos' : ''}</summary>
		<div class="howto-body">{@render details()}</div>
	</details>
{:else}
	{@render details()}
{/if}

<style>
	.cues {
		margin: 0;
		padding-left: 18px;
		font-size: 15px;
		color: var(--ink-2);
	}

	.cues li + li {
		margin-top: 2px;
	}

	figure {
		margin: 0 0 8px;
	}

	.frames {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		max-width: 480px;
	}

	.frame {
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		background: #fff;
		aspect-ratio: 4 / 3;
	}

	.frame img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.frame span {
		position: absolute;
		left: 6px;
		bottom: 6px;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgb(28 27 25 / 0.8);
		color: #fff;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	figcaption {
		margin-top: 4px;
		font-size: 13px;
	}

	.extras {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px 16px;
		margin-top: 10px;
	}

	details {
		font-size: 15px;
		flex-basis: 100%;
		order: 1;
	}

	summary {
		cursor: pointer;
		color: var(--ink-2);
		font-weight: 600;
		min-height: 32px;
		display: flex;
		align-items: center;
	}

	.howto {
		margin-top: 4px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius);
		background: var(--panel);
		/* Lets block-size transition to and from `auto`. */
		interpolate-size: allow-keywords;
	}

	.howto > summary {
		min-height: 48px;
		padding: 0 14px;
		color: var(--ink);
		list-style: none;
	}

	.howto > summary::-webkit-details-marker {
		display: none;
	}

	/* Chevron that points down when closed and flips up when open. */
	.howto > summary::after {
		content: '';
		width: 9px;
		height: 9px;
		margin: -4px 4px 0 auto;
		border-right: 2.5px solid currentColor;
		border-bottom: 2.5px solid currentColor;
		transform: rotate(45deg);
		transition: transform 0.3s ease;
	}

	.howto[open] > summary::after {
		margin-top: 4px;
		transform: rotate(-135deg);
	}

	/* Slide and fade the content. Browsers without ::details-content just open instantly. */
	.howto::details-content {
		block-size: 0;
		overflow: hidden;
		opacity: 0;
		transition:
			block-size 0.3s ease,
			opacity 0.25s ease,
			content-visibility 0.3s allow-discrete;
	}

	.howto[open]::details-content {
		block-size: auto;
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.howto::details-content,
		.howto > summary::after {
			transition: none;
		}
	}

	.howto-body {
		padding: 0 14px 14px;
	}

	ol {
		margin: 8px 0 0;
		padding-left: 20px;
		color: var(--ink-2);
	}
</style>
