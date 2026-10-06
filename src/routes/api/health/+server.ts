import { error, json } from '@sveltejs/kit';
import { ingest, userForKey } from '#lib/server/health.ts';
import type { RequestHandler } from './$types';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Receives Health Connect data from the "Health Connect Webhook" phone app.
 * Auth: `Authorization: Bearer <key>` (set as a custom header in the app). Keys come from /health.
 */
export const POST: RequestHandler = async ({ request }) => {
	const key =
		request.headers
			.get('authorization')
			?.replace(/^Bearer\s+/i, '')
			.trim() ?? '';
	const userId = await userForKey(key);
	if (!userId) error(401, 'Missing or unknown key');

	if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES)
		error(413, 'Payload too large');
	const text = await request.text();
	if (text.length > MAX_BYTES) error(413, 'Payload too large');

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Body must be JSON');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body))
		error(400, 'Body must be a JSON object');

	const stored = await ingest(userId, body as Record<string, unknown>);
	return json({ ok: true, stored });
};
