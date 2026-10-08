import { MAIL_FROM, RESEND_API_KEY } from '$app/env/private';

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

function escape(s: string): string {
	return s.replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
	);
}

export function resetPasswordMail(to: string, name: string, url: string): Mail {
	const hi = name ? `Hi ${name},` : 'Hi,';
	return {
		to,
		subject: 'Reset your Workout Builder password',
		text: `${hi}\n\nUse this link to choose a new password. It works for one hour.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
		html: `<p>${escape(hi)}</p><p>Use this link to choose a new password. It works for one hour.</p><p><a href="${escape(url)}">Choose a new password</a></p><p>If you didn't ask for this, you can ignore this email.</p>`
	};
}
