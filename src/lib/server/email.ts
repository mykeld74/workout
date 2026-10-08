import { MAIL_FROM, ORIGIN, RESEND_API_KEY } from '$app/env/private';
import { emailLayout } from '#lib/server/email-template.ts';

interface Mail {
	to: string;
	subject: string;
	text: string;
	html: string;
}

/** Sends through Resend's HTTP API. Without a key (local dev), prints the message instead. */
export async function sendMail(mail: Mail): Promise<void> {
	if (!RESEND_API_KEY) {
		console.log(`[email] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
		return;
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from: MAIL_FROM, ...mail })
	});
	if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export function resetPasswordMail(to: string, name: string, url: string): Mail {
	const hi = name ? `Hi ${name},` : 'Hi,';
	const intro = [hi, 'Tap the button to choose a new password. The link works once, for one hour.'];
	const outro = ["Didn't ask for this? Ignore this email and your password stays the same."];
	return {
		to,
		subject: 'Reset your Workout Builder password',
		text: `${intro.join('\n\n')}\n\n${url}\n\n${outro.join('\n\n')}`,
		html: emailLayout({
			origin: ORIGIN,
			preheader: 'Your link to choose a new password. It works for one hour.',
			title: 'Reset your password',
			intro,
			button: { label: 'Choose a new password', url },
			outro,
			footer: 'You got this because a password reset was requested for this email'
		})
	};
}
