<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let menuOpen = $state(false);

	// Tell the server this device's time zone, for anything grouped by local day.
	$effect(() => {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz && !document.cookie.includes(`tz=${encodeURIComponent(tz)}`)) {
			document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
		}
	});

	// Close the mobile menu whenever the page changes.
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});

	const links = [
		{ href: '/', label: 'Plan' },
		{ href: '/progress', label: 'Progress' },
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

<svelte:window onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)} />

{#if data.user}
	<header class:open={menuOpen}>
		<a class="brand" href="/">PUSH / PULL</a>
		<button
			type="button"
			class="menu-button"
			aria-expanded={menuOpen}
			aria-controls="main-nav"
			onclick={() => (menuOpen = !menuOpen)}
		>
			<span class="bars" aria-hidden="true"><span></span><span></span><span></span></span>
			<span class="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
		</button>
		<nav id="main-nav" aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}
					>{link.label}</a
				>
			{/each}
			<form method="post" action="/login?/signOut">
				<button class="sign-out">Sign out</button>
			</form>
		</nav>
	</header>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		position: relative;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		max-width: 1120px;
		margin: 0 auto;
		padding: 14px 16px;
		border-bottom: 2px solid var(--ink);
		background: var(--paper);
	}

	.brand {
		font: 800 22px/1 var(--display);
		letter-spacing: 0.06em;
		text-decoration: none;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	nav a,
	.sign-out {
		padding: 10px 10px;
		font: 600 15px/1.2 var(--body);
		text-decoration: none;
		color: var(--ink-2);
		border-radius: 8px;
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		background: var(--wash);
	}

	nav form {
		display: contents;
	}

	.sign-out {
		background: none;
		border: none;
		cursor: pointer;
	}

	.menu-button {
		display: none;
	}

	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 20px 16px 64px;
	}

	@media (max-width: 640px) {
		header {
			padding: 4px 4px 4px 16px;
		}

		.brand {
			font-size: 20px;
		}

		.menu-button {
			display: grid;
			place-items: center;
			width: 48px;
			height: 48px;
			padding: 0;
			border: none;
			background: none;
			color: var(--ink);
			cursor: pointer;
			border-radius: 8px;
		}

		.bars {
			display: grid;
			gap: 5px;
			width: 22px;
		}

		.bars span {
			display: block;
			height: 2.5px;
			border-radius: 2px;
			background: currentColor;
			transition:
				transform 0.25s ease,
				opacity 0.2s ease;
		}

		/* Bars morph into an X when open. */
		.open .bars span:nth-child(1) {
			transform: translateY(7.5px) rotate(45deg);
		}
		.open .bars span:nth-child(2) {
			opacity: 0;
		}
		.open .bars span:nth-child(3) {
			transform: translateY(-7.5px) rotate(-45deg);
		}

		nav {
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			flex-direction: column;
			align-items: stretch;
			gap: 0;
			padding: 6px 8px 10px;
			background: var(--paper);
			border-bottom: 2px solid var(--ink);
			box-shadow: 0 12px 24px rgb(0 0 0 / 0.12);
			visibility: hidden;
			opacity: 0;
			transform: translateY(-6px);
			transition:
				opacity 0.2s ease,
				transform 0.2s ease,
				visibility 0s linear 0.2s;
		}

		.open nav {
			visibility: visible;
			opacity: 1;
			transform: none;
			transition:
				opacity 0.2s ease,
				transform 0.2s ease;
		}

		nav a,
		.sign-out {
			display: flex;
			align-items: center;
			min-height: 48px;
			padding: 0 12px;
			font-size: 17px;
			text-align: left;
		}

		main {
			padding-top: 12px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bars span,
		nav {
			transition: none !important;
		}
	}
</style>
