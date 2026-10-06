<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let confirm = $state<'revoke' | 'delete' | null>(null);
	let copied = $state<string | null>(null);

	const LABELS: Record<string, string> = {
		steps: 'Steps',
		heart_rate: 'Heart rate',
		resting_heart_rate: 'Resting heart rate',
		hrv: 'Heart rate variability',
		weight: 'Weight',
		exercise: 'Exercise sessions',
		distance: 'Distance',
		active_calories: 'Active calories',
		total_calories: 'Total calories'
	};

	const fmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = null), 2000);
		} catch {
			copied = null;
		}
	}
</script>

<section>
	<p class="kicker">Connections</p>
	<h1>Samsung Health</h1>
	<p class="muted">
		Your Galaxy Watch and phone data reaches this app through Health Connect: weight, resting heart
		rate, heart rate variability, steps, workouts, heart rate and calories. It's used for your
		body-weight chart, a daily readiness check, workout summaries and the weekly view.
	</p>
</section>

<section class="card status">
	<h2>Status</h2>
	{#if data.key?.lastUsedAt}
		<p><strong>Connected.</strong> Last data received {fmt.format(data.key.lastUsedAt)}.</p>
	{:else if data.key}
		<p>
			<strong>Key created</strong>
			{fmt.format(data.key.createdAt)}. Waiting for the first sync.
		</p>
	{:else}
		<p><strong>Not connected.</strong> Follow the steps below.</p>
	{/if}
	{#if data.counts.length}
		<ul class="counts">
			{#each data.counts as c (c.metric)}
				<li>
					<span>{LABELS[c.metric] ?? c.metric}</span>
					<span class="muted">{c.count.toLocaleString()} · latest {fmt.format(c.latest)}</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if data.readiness.status !== 'unknown' || data.counts.length}
		<p class="readiness">{data.readiness.message}</p>
	{/if}
</section>

<section class="card">
	<h2>Set it up</h2>
	<ol class="steps">
		<li>
			<strong>In Samsung Health</strong>, open Settings → Health Connect, and allow Samsung Health
			to share the data types above.
		</li>
		<li>
			<strong>Install Health Connect Webhook</strong> from the
			<a
				href="https://play.google.com/store/apps/details?id=com.hcwebhook.app"
				target="_blank"
				rel="noreferrer">Play Store</a
			>
			(open source:
			<a href="https://github.com/mcnaveen/health-connect-webhook" target="_blank" rel="noreferrer"
				>GitHub</a
			>). Give it read access to steps, heart rate, resting heart rate, heart rate variability,
			weight, exercise, distance and calories.
		</li>
		<li>
			<strong>Add a webhook</strong> with this URL:
			<span class="copy-row">
				<code>{data.webhookUrl}</code>
				<button type="button" class="btn ghost small" onclick={() => copy(data.webhookUrl, 'url')}>
					{copied === 'url' ? 'Copied' : 'Copy'}
				</button>
			</span>
		</li>
		<li>
			<strong>Add a custom header</strong> to that webhook: name <code>Authorization</code>, value
			<code>Bearer</code> followed by a space and your key.
			{#if form?.newKey}
				<span class="key-box" role="status">
					<span class="copy-row">
						<code class="key">Bearer {form.newKey}</code>
						<button
							type="button"
							class="btn small"
							onclick={() => copy(`Bearer ${form!.newKey}`, 'key')}
						>
							{copied === 'key' ? 'Copied' : 'Copy'}
						</button>
					</span>
					<span class="muted small"
						>This is the only time the key is shown. Copy it into the phone app now.</span
					>
				</span>
			{:else}
				<form method="post" action="?/createKey" use:enhance class="inline">
					<button class="btn small">{data.key ? 'Make a new key' : 'Create my key'}</button>
					{#if data.key}<span class="muted small">The old key stops working.</span>{/if}
				</form>
			{/if}
		</li>
		<li>
			<strong>Turn on scheduled sync</strong> (every hour or so is plenty) and run it once now. The status
			above updates when data arrives.
		</li>
	</ol>
	<p class="muted small">
		Your data goes from your phone straight to this app; the webhook app has no servers of its own.
		Only the last 48 hours are sent each time, so older history isn't back-filled.
	</p>
</section>

<section class="card danger-zone">
	<h2>Disconnect</h2>
	{#if form?.revoked}<p role="status">Key removed. The phone app can no longer send data.</p>{/if}
	{#if form?.deleted}<p role="status">All Samsung Health data deleted from this app.</p>{/if}
	<div class="row">
		{#if confirm === 'revoke'}
			<form
				method="post"
				action="?/revokeKey"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						confirm = null;
					}}
			>
				<span>Stop accepting data from your phone?</span>
				<button class="btn small danger">Remove key</button>
				<button type="button" class="btn ghost small" onclick={() => (confirm = null)}>Keep</button>
			</form>
		{:else if confirm === 'delete'}
			<form
				method="post"
				action="?/deleteData"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						confirm = null;
					}}
			>
				<span>Delete every health reading stored here? This can't be undone.</span>
				<button class="btn small danger">Delete data</button>
				<button type="button" class="btn ghost small" onclick={() => (confirm = null)}>Keep</button>
			</form>
		{:else}
			<button
				type="button"
				class="btn ghost small danger"
				disabled={!data.key}
				onclick={() => (confirm = 'revoke')}>Remove key</button
			>
			<button
				type="button"
				class="btn ghost small danger"
				disabled={!data.counts.length}
				onclick={() => (confirm = 'delete')}>Delete health data</button
			>
		{/if}
	</div>
</section>

<style>
	section + section {
		margin-top: 16px;
	}

	h1 {
		font-size: 56px;
	}

	h2 {
		font-size: 26px;
		margin-bottom: 8px;
	}

	.status p {
		margin: 0 0 8px;
	}

	.counts {
		list-style: none;
		margin: 8px 0;
		padding: 0;
	}

	.counts li {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}

	.readiness {
		font-weight: 600;
	}

	.steps {
		margin: 0;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.copy-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 14px;
		background: var(--wash);
		padding: 2px 6px;
		border-radius: 6px;
		overflow-wrap: anywhere;
	}

	.key-box {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 8px;
		padding: 10px 12px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
	}

	.inline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	.small {
		font-size: 14px;
	}

	.row,
	.row form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.danger {
		--accent: var(--danger);
	}
</style>
