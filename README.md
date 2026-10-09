# Chog World Order

A contribution economy for the Monad ecosystem, combining Chog Passport, contributor reputation, and paid collaborations.

This repository is the first web sketch: a landing page and placeholder routes. It does not deploy the app or any smart contracts.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4

## Requirements

- Node.js 22 or newer
- npm

## Setup

```bash
npm install
npm run dev
```

The dev server starts at [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run lint` | Run ESLint |
| `npm run build` | Typecheck and create a production build |

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing page |
| `/passport` | Chog Passport placeholder |
| `/collabs` | Paid collaborations placeholder |
| `/leaderboard` | Contributor reputation placeholder |
| `/profile/[address]` | Public profile placeholder for a wallet address |

Sample profiles are linked from the leaderboard. Any other address still renders the placeholder profile.

## Project structure

```text
src/app            App Router pages
src/components     Shared layout and stamp UI
src/lib            Site copy and placeholder sample data
```

Placeholder names, scores, and briefs are invented. They are not live Monad data.
