import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	RESEND_API_KEY: {
		description:
			'Resend API key for password-reset emails. When unset, the reset link is printed to the server log instead.',
		schema: (value) => value || undefined
	},
	MAIL_FROM: {
		description:
			'Sender for app emails, e.g. `Workout Builder <noreply@theworkoutbuilder.com>`. The domain must be verified in Resend.',
		schema: (value) => value || 'Workout Builder <noreply@theworkoutbuilder.com>'
	}
});
