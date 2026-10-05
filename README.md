# Push / Pull — workout builder

A SvelteKit app that builds dumbbell-friendly workout plans around your **age** and the **equipment you own**, walks you through each workout one exercise at a time, logs your sets, and builds a fresh plan whenever you want to switch it up.

The starting point is the original Push/Pull workout sheets: a 4-day Push A → Pull A → Push B → Pull B rotation plus a daily Mobility + Core add-on (A → B → C). Your first plan follows those sheets exactly; later plans keep the same structure with different exercises.

## Features

- **Profile** — birthday (age is calculated, so it stays current), training experience, and a checklist of equipment. Bodyweight exercises are always available.
- **Age-aware plans** — age shapes rep ranges, warm-up length, effort targets (reps left in reserve), how often to take a lighter week, and which exercises are allowed:

  | Age      | Changes                                                                                                               |
  | -------- | --------------------------------------------------------------------------------------------------------------------- |
  | Under 40 | 5–8 min warm-up, 1–2 reps in reserve, lighter week every 6–8 weeks                                                    |
  | 40–54    | 8–10 min warm-up, 1–3 reps in reserve, lighter week every 5–6 weeks                                                   |
  | 55–64    | 10–12 min warm-up with balance work, reps start at 8+, lighter week every 4–5 weeks, high joint-stress lifts left out |
  | 65+      | As 55–64, plus 10–15 reps, 2–3 reps in reserve, expert-level lifts left out                                           |

- **Plan page** — what's next in the rotation, every workout in the current plan, how to run it, recent sessions, and **New workouts** to build a new plan that avoids the current exercises (history is kept).
- **Workout preview** — every exercise with target, rest, photos and cues. **Swap** opens a list of exercises that fit the same slot with your equipment, or **Surprise me** for a random pick.
- **Workout screen** — one exercise at a time:
  - Log weight and reps (or seconds for holds) per set; weights prefill from last time.
  - "Last time" numbers, plus a nudge to go up a weight when you hit the top of the range on every set.
  - Tapping **Done** starts a rest countdown at the low end of the rest range (90–120s → 90s), with +30s and Skip. Stretches have no rest timer; holds get a hold timer.
  - Photos, cues and a **Watch video** link sit in a collapsible "How to do it" panel so the inputs stay in view on a phone.
  - Finish with optional body weight and notes, or discard the session.
- **Exercise library** — search and filter by movement, source and "fits my gear". **Import** pulls ~800 strength and stretching exercises (with instructions and start/finish photos) from the public-domain [Free Exercise DB](https://github.com/yuhonas/free-exercise-db). Re-running it adds anything new and refreshes photos without duplicates.
- **Accounts** — email and password sign-in via Better Auth. Every page except `/login` requires a signed-in user.

## Tech stack

- [SvelteKit 3](https://svelte.dev/docs/kit) + Svelte 5 (runes), TypeScript
- [Drizzle ORM](https://orm.drizzle.team) on [Neon](https://neon.tech) serverless Postgres
- [Better Auth](https://www.better-auth.com) (email + password)
- Netlify adapter for deployment
- pnpm, Prettier, ESLint

## Getting started

1. **Install dependencies**

   ```sh
   pnpm install
   ```

   This repo's pnpm setup refuses package versions published in the last 24 hours. If an install fails with a `minimumReleaseAge` error, wait a day or pin the previous version rather than turning the check off.

2. **Configure environment** — copy `.env.example` to `.env` and fill in:

   | Variable             | Description                                           |
   | -------------------- | ----------------------------------------------------- |
   | `DATABASE_URL`       | Neon Postgres connection string                       |
   | `ORIGIN`             | The app's base URL, e.g. `http://localhost:5173`      |
   | `BETTER_AUTH_SECRET` | 32+ random characters, e.g. `openssl rand -base64 32` |

3. **Create the database tables**

   ```sh
   set -a && source .env && set +a && pnpm db:push
   ```

   `drizzle-kit push` is interactive when a column is added and another removed in the same change. Answer its "created or renamed?" prompts in a regular terminal; choose **create** unless you're genuinely renaming a column with compatible data.

4. **Run it**

   ```sh
   pnpm dev
   ```

   Open http://localhost:5173, create an account, then fill in your profile to build your first plan. The built-in exercises from the sheets are written to the database automatically on first use (and refreshed each time the server starts).

## Scripts

| Script                                 | What it does                                          |
| -------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                             | Start the dev server                                  |
| `pnpm build` / `pnpm preview`          | Production build and preview                          |
| `pnpm check`                           | Type-check Svelte and TypeScript                      |
| `pnpm lint` / `pnpm format`            | Prettier + ESLint check / auto-format                 |
| `pnpm db:push`                         | Sync `src/lib/server/db/schema.ts` to the database    |
| `pnpm db:generate` / `pnpm db:migrate` | Generate / apply SQL migrations instead of pushing    |
| `pnpm db:studio`                       | Browse the database in Drizzle Studio                 |
| `pnpm auth:schema`                     | Regenerate the Better Auth tables in `auth.schema.ts` |

## Project structure

```
src/
├── hooks.server.ts            Better Auth session + sign-in guard
├── app.css                    Design tokens (light + dark) and shared styles
├── lib/
│   ├── workout/               Pure logic, no database (runs in Node directly)
│   │   ├── types.ts           Equipment, movement patterns, profile, age helper
│   │   ├── catalog.ts         Exercises from the sheets + starters, photo mapping
│   │   └── generator.ts       Plan generator, age rules, prescriptions, swaps
│   ├── server/
│   │   ├── workouts.ts        Plans, sessions, set logs, swaps, search
│   │   ├── exercise-import.ts Free Exercise DB importer and mapping
│   │   ├── auth.ts            Better Auth config
│   │   └── db/                Drizzle client and schema
│   └── components/
│       ├── ExerciseCues.svelte Photos, cues, video link, collapsible panel
│       └── Countdown.svelte    Rest / hold timer
└── routes/
    ├── +page.*                Plan dashboard and "New workouts"
    ├── login/                 Sign in / create account
    ├── setup/                 Profile: birthday, experience, equipment
    ├── workouts/[id]/         Workout preview and swap menu
    ├── sessions/[id]/         Workout screen: logging, timers, finish
    └── exercises/             Library, filters, import
```

`src/routes/demo/` is leftover scaffolding from `sv create` and can be deleted.

## How plans are generated

Each lifting day is a list of slots, each a movement pattern plus a role (primary, secondary or accessory), e.g. Push A = squat, horizontal push, single-leg, vertical push, chest isolation, shoulder isolation, triceps. For each slot the generator:

1. Filters the exercise pool to what your equipment allows and what's appropriate for your age and experience.
2. On your first plan, uses the exercise from the original sheet for that slot when it can.
3. Otherwise scores candidates, preferring exercises not in your previous plan, curated exercises over imported ones, and loadable lifts for primary slots, and avoids repeats within the plan.
4. Falls back to a related pattern (e.g. vertical pull → row) when nothing fits.

Mobility days pick 7 stretches and 4 core exercises, spread across body areas. Sets and reps come from the exercise's own prescription (matching the sheets) or the slot's role, then adjust for age. The progress rule throughout: hit the top of the range on every set, then go up a dumbbell (or slow the lowering, pause, or add a band).

## Exercise photos

Photos come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (public domain) and load from GitHub's CDN. 60 of the 74 built-in exercises have a start/finish pair; 25 of those show a close variation and are labelled as such. The rest show cues and a **Watch video** link (a YouTube search) only. Edit the `PHOTOS` map in `catalog.ts` to change a match.

## Deploying

The app uses `@sveltejs/adapter-netlify`. Set `DATABASE_URL`, `ORIGIN` (your site's URL) and `BETTER_AUTH_SECRET` in Netlify's environment variables, then build with `pnpm build`.

---

General fitness guidance, not medical advice.
