/**
 * A short beep for the end of a rest or hold. Browsers only allow sound after a tap, so
 * `unlockAudio()` is called from tap handlers (Done, Start hold) and `beep()` plays later.
 */
let ctx: AudioContext | null = null;
const KEY = 'workout:timer-sound';

export function soundEnabled(): boolean {
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

export function setSoundEnabled(on: boolean) {
	try {
		localStorage.setItem(KEY, on ? 'on' : 'off');
	} catch {
		// Not saved; applies for this page only.
	}
}

export function unlockAudio() {
	try {
		ctx ??= new AudioContext();
		if (ctx.state === 'suspended') void ctx.resume();
	} catch {
		ctx = null;
	}
}

/** Three short rising tones. Silent if sound is off or was never unlocked. */
export function beep() {
	if (!ctx || !soundEnabled()) return;
	const start = ctx.currentTime;
	[660, 660, 880].forEach((freq, i) => {
		const osc = ctx!.createOscillator();
		const gain = ctx!.createGain();
		osc.type = 'sine';
		osc.frequency.value = freq;
		const t = start + i * 0.22;
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
		osc.connect(gain).connect(ctx!.destination);
		osc.start(t);
		osc.stop(t + 0.2);
	});
}
