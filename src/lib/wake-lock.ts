/**
 * Keeps the screen from dimming or locking until the returned function is called. Use it as the
 * return value of an `$effect` so the lock ends when the component unmounts.
 *
 * Browsers drop the lock whenever the page is hidden (switching apps, locking the phone), so it's
 * requested again each time the page becomes visible. Where the API is missing or the request is
 * refused (e.g. battery saver), the screen just behaves normally.
 */
export function keepScreenOn(): () => void {
	if (!('wakeLock' in navigator)) return () => {};

	let sentinel: WakeLockSentinel | null = null;
	let pending = false;
	let stopped = false;

	async function request() {
		if (stopped || pending || document.visibilityState !== 'visible') return;
		if (sentinel && !sentinel.released) return;
		pending = true;
		try {
			const lock = await navigator.wakeLock.request('screen');
			// Stopped while the request was in flight: give the lock straight back.
			if (stopped) lock.release();
			else sentinel = lock;
		} catch {
			// Refused (battery saver, permissions policy): nothing to do.
		} finally {
			pending = false;
		}
	}

	document.addEventListener('visibilitychange', request);
	request();

	return () => {
		stopped = true;
		document.removeEventListener('visibilitychange', request);
		sentinel?.release();
		sentinel = null;
	};
}
