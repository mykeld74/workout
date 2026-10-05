import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.ts';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

const PUBLIC_PATHS = ['/login', '/api/auth', '/demo'];

/** Everything except the login page requires a signed-in user — including form actions. */
const requireUser: Handle = ({ event, resolve }) => {
	const path = event.url.pathname;
	if (!event.locals.user && !PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
		redirect(303, '/login');
	}
	return resolve(event);
};

export const handle: Handle = sequence(handleBetterAuth, requireUser);
