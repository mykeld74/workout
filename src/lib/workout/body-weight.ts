/** Picks one body-weight reading per day: the one closest to a set time (6:00 AM by default). */

export interface WeightReading {
	date: Date;
	weight: number;
	source: 'workout' | 'samsung';
}

/** A valid IANA time zone name, or UTC. */
export function safeTimeZone(tz: string | undefined | null): string {
	if (!tz) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return tz;
	} catch {
		return 'UTC';
	}
}

/** Local calendar day ("2026-10-06") and minutes since midnight, in `timeZone`. */
export function localParts(date: Date, timeZone: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(date)
			.map((p) => [p.type, p.value])
	);
	return {
		day: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

export function oneWeightPerDay<T extends WeightReading>(
	readings: T[],
	timeZone: string,
	targetHour = 6
): T[] {
	const target = targetHour * 60;
	const best = new Map<string, { reading: T; distance: number }>();
	for (const reading of readings) {
		const { day, minutes } = localParts(reading.date, timeZone);
		const distance = Math.abs(minutes - target);
		const current = best.get(day);
		// Closest to the target wins; on a tie, the earlier reading.
		if (
			!current ||
			distance < current.distance ||
			(distance === current.distance && reading.date < current.reading.date)
		) {
			best.set(day, { reading, distance });
		}
	}
	return [...best.values()]
		.map((b) => b.reading)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}
