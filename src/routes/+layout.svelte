<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Plan' },
		{ href: '/exercises', label: 'Exercises' },
		{ href: '/setup', label: 'Profile' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap"
	/>
	<title>Workout Builder</title>
</svelte:head>

{#if data.user}
	<header>
		<a class="brand" href="/">PUSH / PULL</a>
		<nav aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}
					>{link.label}</a
				>
			{/each}
		</nav>
	</header>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		max-width: 760px;
		margin: 0 auto;
		padding: 14px 16px;
		border-bottom: 2px solid var(--ink);
	}

	.brand {
		font: 800 22px/1 var(--display);
		letter-spacing: 0.06em;
		text-decoration: none;
	}

	nav {
		display: flex;
		gap: 4px;
	}

	nav a {
		padding: 10px 10px;
		font-weight: 600;
		font-size: 15px;
		text-decoration: none;
		color: var(--ink-2);
		border-radius: 8px;
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		background: var(--wash);
	}

	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 20px 16px 64px;
	}
</style>
