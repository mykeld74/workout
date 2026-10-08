<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let mode = $state<'signIn' | 'signUp'>('signIn');
</script>

<section>
	<h1>Workout Builder</h1>
	<p class="muted">Plans built around your age and the equipment you own.</p>

	{#if page.url.searchParams.has('reset') && !form}
		<p class="note" role="status">Password updated. Sign in with the new one.</p>
	{/if}

	<form method="post" action="?/{mode}" use:enhance class="card">
		{#if mode === 'signUp'}
			<label>
				Name
				<input name="name" autocomplete="name" />
			</label>
		{/if}
		<label>
			Email
			<input type="email" name="email" autocomplete="email" required value={form?.email ?? ''} />
		</label>
		<label>
			Password
			<input
				type="password"
				name="password"
				minlength="8"
				required
				autocomplete={mode === 'signUp' ? 'new-password' : 'current-password'}
			/>
		</label>
		{#if mode === 'signIn'}<a class="forgot" href="/reset-password">Forgot password?</a>{/if}
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn">{mode === 'signIn' ? 'Sign in' : 'Create account'}</button>
	</form>

	<button
		class="link"
		type="button"
		onclick={() => (mode = mode === 'signIn' ? 'signUp' : 'signIn')}
	>
		{mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
	</button>
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

	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 12px;
	}

	.note {
		margin-top: 12px;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--wash);
		border: 1px solid var(--line-strong);
	}

	.forgot {
		align-self: flex-end;
		margin-top: -6px;
		font-size: 14px;
		color: var(--ink-2);
	}

	.link {
		align-self: center;
		background: none;
		border: none;
		font: inherit;
		color: var(--ink-2);
		text-decoration: underline;
		min-height: 44px;
		cursor: pointer;
	}
</style>
