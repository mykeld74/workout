<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Tell the server this device's time zone, for anything grouped by local day.
	$effect(() => {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz && !document.cookie.includes(`tz=${encodeURIComponent(tz)}`)) {
			document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
		}
	});

	const links: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Plan', icon: 'home' },
		{ href: '/progress', label: 'Progress', icon: 'chart' },
		{ href: '/exercises', label: 'Exercises', icon: 'barbell' },
		{ href: '/setup', label: 'Profile', icon: 'user' }
	];

	const path = $derived(page.url.pathname);
	const isCurrent = (href: string) =>
		href === '/' ? path === '/' || path.startsWith('/workouts') : path.startsWith(href);
	// A workout in progress gets the whole screen; its own back link leads out.
	const focused = $derived(path.startsWith('/sessions/'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
	/>
	<title>Workout Builder</title>
</svelte:head>

{#if data.user}
	<header>
		<a class="brand" href="/">
			<span class="mark" aria-hidden="true"><Icon name="barbell" size={18} /></span>
			Workout Builder
		</a>
		<nav class="top-nav" aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}>
					<Icon name={link.icon} size={18} />{link.label}
				</a>
			{/each}
			<form method="post" action="/login?/signOut">
				<button class="sign-out" aria-label="Sign out"><Icon name="logout" size={18} /></button>
			</form>
		</nav>
	</header>
{/if}

<main class:with-tabs={data.user && !focused}>
	{@render children()}
</main>

{#if data.user && !focused}
	<nav class="tab-bar" aria-label="Main">
		{#each links as link (link.href)}
			<a href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}>
				<Icon name={link.icon} size={24} />
				<span>{link.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		max-width: 1120px;
		margin: 0 auto;
		padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font: 700 18px/1 var(--display);
		letter-spacing: -0.01em;
		text-decoration: none;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--lime);
		color: var(--on-accent);
	}

	.top-nav {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.top-nav a,
	.sign-out {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 12px;
		font: 500 15px/1 var(--body);
		text-decoration: none;
		color: var(--ink-2);
		border-radius: 999px;
	}

	.top-nav a:hover,
	.sign-out:hover {
		color: var(--ink);
	}

	.top-nav a[aria-current='page'] {
		color: var(--on-accent);
		background: var(--lime);
	}

	.top-nav form {
		display: contents;
	}

	.sign-out {
		background: none;
		border: none;
		cursor: pointer;
	}

	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 12px 16px 64px;
	}

	.tab-bar {
		display: none;
	}

	@media (max-width: 640px) {
		.top-nav {
			display: none;
		}

		.tab-bar {
			position: fixed;
			z-index: 20;
			left: 0;
			right: 0;
			bottom: 0;
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
			background: color-mix(in srgb, var(--paper) 92%, transparent);
			backdrop-filter: blur(12px);
			border-top: 1px solid var(--line);
		}

		.tab-bar a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 3px;
			min-height: 52px;
			justify-content: center;
			font: 500 12px/1 var(--body);
			color: var(--ink-2);
			text-decoration: none;
			border-radius: 12px;
		}

		.tab-bar a[aria-current='page'] {
			color: var(--lime);
		}

		main.with-tabs {
			padding-bottom: calc(96px + env(safe-area-inset-bottom));
		}
	}
</style>
