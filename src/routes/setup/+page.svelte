<script lang="ts">
	import { enhance } from '$app/forms';
	import { EQUIPMENT, type Equipment } from '#lib/workout/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let saving = $state(false);

	const experienceOptions = [
		{ value: 'new', label: 'New to lifting', hint: 'Simpler moves, no advanced lifts' },
		{ value: 'returning', label: 'Returning / some experience', hint: 'The default' },
		{ value: 'experienced', label: 'Experienced', hint: 'Unlocks advanced lifts' }
	];

	const today = new Date().toISOString().slice(0, 10);

	const equipmentEntries = Object.entries(EQUIPMENT) as [Equipment, string][];
</script>

<section>
	<p class="kicker">{data.isNew ? 'Step 1 of 1' : 'Profile'}</p>
	<h1>About you</h1>
	<p class="muted">
		Your age (worked out from your birthday) shapes rep ranges, warm-up length, effort targets and
		how often to take a lighter week. Your equipment decides which exercises can show up.
	</p>

	<form
		method="post"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
	>
		<label class="age">
			Birthday
			<input
				type="date"
				name="birthDate"
				min="1920-01-01"
				max={today}
				required
				value={data.profile.birthDate}
			/>
			{#if 'age' in data.profile}<span class="muted hint">Age {data.profile.age}</span>{/if}
		</label>

		<fieldset>
			<legend>Training experience</legend>
			{#each experienceOptions as opt (opt.value)}
				<label class="choice">
					<input
						type="radio"
						name="experience"
						value={opt.value}
						checked={data.profile.experience === opt.value}
					/>
					<span>{opt.label} <small class="muted">{opt.hint}</small></span>
				</label>
			{/each}
		</fieldset>

		<fieldset>
			<legend>Equipment you have</legend>
			<div class="grid">
				{#each equipmentEntries as [value, label] (value)}
					<label class="choice">
						<input
							type="checkbox"
							name="equipment"
							{value}
							checked={data.profile.equipment.includes(value)}
						/>
						<span>{label}</span>
					</label>
				{/each}
			</div>
			<p class="muted hint">Bodyweight exercises are always included.</p>
		</fieldset>

		{#if data.hasProgram}
			<label class="choice">
				<input type="checkbox" name="regenerate" />
				<span>Build a new plan with these settings</span>
			</label>
		{/if}

		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

		<button class="btn" disabled={saving}>
			{saving ? 'Saving…' : data.hasProgram ? 'Save' : 'Build my plan'}
		</button>
		<p class="muted fine">
			General fitness guidance, not medical advice. Check with your doctor if you have joint, heart
			or blood-pressure concerns.
		</p>
	</form>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h1 {
		font-size: 56px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin-top: 8px;
	}

	.age {
		max-width: 220px;
	}

	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	legend {
		font-weight: 600;
		font-size: 15px;
		margin-bottom: 8px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
	}

	.choice {
		flex-direction: row;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 8px 12px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius);
		background: var(--panel);
		font-weight: 500;
		cursor: pointer;
	}

	.choice:has(input:checked) {
		border-color: var(--ink);
		background: var(--wash);
	}

	.choice input {
		width: 20px;
		height: 20px;
		min-height: 0;
		margin: 0;
		accent-color: var(--ink);
	}

	.choice small {
		display: block;
		font-size: 13px;
	}

	.hint,
	.fine {
		margin: 0;
		font-size: 14px;
	}
</style>
