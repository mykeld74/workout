<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let expired = $derived(data.expired || (form && 'expired' in form && form.expired));
	let choosing = $derived(!!data.token && !expired);
	let sent = $derived(form && 'sent' in form && form.sent);
</script>

<svelte:head><title>Reset password · Workout Builder</title></svelte:head>

<section>
	<h1>{choosing ? 'New password' : 'Reset password'}</h1>

	{#if choosing}
		<p class="muted">Pick a new password. You'll be signed out on your other devices.</p>
		<form method="post" action="?/reset" use:enhance class="card">
			<input type="hidden" name="token" value={data.token} />
			<label>
				New password
				<input type="password" name="password" minlength="8" required autocomplete="new-password" />
			</label>
			<label>
				Type it again
				<input type="password" name="confirm" minlength="8" required autocomplete="new-password" />
			</label>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn">Save password</button>
		</form>
	{:else if sent}
		<div class="card" role="status">
			<p>
				If <strong>{form?.email}</strong> has an account, a reset link is on its way. It works for one
				hour.
			</p>
			<p class="muted">Nothing after a few minutes? Check spam, or send it again.</p>
		</div>
		<form method="post" action="?/request" use:enhance>
			<input type="hidden" name="email" value={form?.email} />
			<button class="btn ghost">Send again</button>
		</form>
	{:else}
		{#if expired}
			<p class="error" role="alert">
				That link has expired or was already used. Get a new one below.
			</p>
		{:else}
			<p class="muted">Enter your account email and we'll send you a link to choose a new one.</p>
		{/if}
		<form method="post" action="?/request" use:enhance class="card">
			<label>
				Email
				<input
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form && 'email' in form ? form.email : ''}
				/>
			</label>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn">Send reset link</button>
		</form>
	{/if}

	<a class="link" href="/login">Back to sign in</a>
</section>

<style>
	section {
		max-width: 420px;
		margin: 8vh auto 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h1 {
		font-size: 44px;
		color: var(--lime);
	}

	form.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 12px;
	}

	.card p + p {
		margin-top: 8px;
	}

	.link {
		align-self: center;
		color: var(--ink-2);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
</style>
