import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

// The emailed link goes to /api/auth/reset-password/<token>, which checks it and sends the
// browser here with ?token=… (or ?error=INVALID_TOKEN when it's expired or already used).
export const load: PageServerLoad = ({ url }) => ({
	token: url.searchParams.get('token'),
	expired: url.searchParams.get('error') === 'INVALID_TOKEN'
});

export const actions: Actions = {
	request: async ({ request }) => {
		const email = (await request.formData()).get('email')?.toString().trim() ?? '';
		if (!email) return fail(400, { email, message: 'Enter your email.' });
		try {
			await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
		} catch (error) {
			console.error('Password reset email failed', error);
			return fail(500, { email, message: "Couldn't send the email. Try again in a minute." });
		}
		// Same answer whether or not the account exists.
		return { sent: true, email };
	},
	reset: async ({ request }) => {
		const form = await request.formData();
		const token = form.get('token')?.toString() ?? '';
		const newPassword = form.get('password')?.toString() ?? '';
		if (newPassword !== form.get('confirm')?.toString()) {
			return fail(400, { message: "Those passwords don't match." });
		}
		try {
			await auth.api.resetPassword({ body: { token, newPassword } });
		} catch (error) {
			if (error instanceof APIError) {
				const expired = error.body?.code === 'INVALID_TOKEN';
				return fail(400, {
					expired,
					message: expired ? undefined : error.message || "Couldn't change the password."
				});
			}
			return fail(500, { message: 'Unexpected error' });
		}
		redirect(303, '/login?reset=1');
	}
};
