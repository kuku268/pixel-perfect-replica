# Pixel Perfect Replica

Video Speed Reader — upload a video, get a clean transcript in three minutes.

This is a **plain Vite + React single-page app**. There is no SSR and no server
runtime: `vite build` emits a fully static bundle to `dist/`, which is what
Vercel deploys.

## Stack

- Vite + React 19 (`@vitejs/plugin-react`)
- React Router (`react-router-dom`) for client-side routing
- Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui
- Supabase for auth (`@supabase/supabase-js`)
- TanStack Query for data fetching

## Routes

| Path | Component |
| --- | --- |
| `/` | `src/pages/Landing.tsx` |
| `/app` | `src/pages/AppDashboard.tsx` (requires a session) |
| `/signin` | `src/pages/SignIn.tsx` |
| `/signup` | `src/pages/SignUp.tsx` |
| anything else | `src/pages/NotFound.tsx` |

Routes are declared in `src/App.tsx`. There is no file-based routing and no
generated route tree.

## Development

Requires Node.js 20+.

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # -> dist/
npm run preview  # serve the production build locally
```

## Environment variables

The Supabase client reads Vite-exposed variables at build time:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

These live in `.env` and must also be set in the Vercel project settings, since
they are inlined during the build.

## Deploying to Vercel

`vercel.json` pins the static setup:

- build `npm run build`, output `dist/`
- a catch-all rewrite (`/(.*)` → `/index.html`) so deep links such as `/app`
  are served the SPA shell and resolved by React Router on the client

Vercel serves matching static files before applying rewrites, so hashed assets
under `/assets/*` are unaffected.
