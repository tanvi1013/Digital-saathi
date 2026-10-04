# Digital Saathi

Digital Saathi is a mobile-first digital literacy app for senior citizens. It uses plain HTML, CSS and browser JavaScript in the frontend, with a small Express JavaScript server and optional Supabase persistence.

## Run locally

Requirements: Node.js 18 or newer and npm.

```sh
npm install
npm start
```

Open `http://localhost:3000`. Supabase must be configured and seeded before lessons can load; the app does not bundle a local text/catalog fallback.

## Connect Supabase, Auth, and Content

1. Create a Supabase project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql), then run [`supabase/seed.sql`](supabase/seed.sql). The schema creates profiles, progress, and the catalog row; the seed inserts all UI, lesson, quiz, and Saathi content into that row.
2. In **Authentication → Providers**, enable Email sign-in. In **URL Configuration**, allow `http://localhost:3000/**` as a redirect URL.
3. Copy `.env.example` to `.env`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the project API settings. The anon/publishable key is intended for browser clients; do not put a service-role key in this app.
4. Run `npm install`, then restart with `npm start`. `GET /api/health` should report `"database":"configured"`.
5. Open the app and create an account. Public registration creates a senior account only; the role is assigned by the database trigger and cannot be selected in the form.
6. To make the first admin, replace the email below with the account you registered and run this as the project owner in Supabase SQL Editor:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
	and lower(u.email) = lower('admin@example.com');
```

Sign out and back in. The **Admin** navigation item will appear. Open it to find a localized string, edit its English, Hindi, or Marathi value, and save. The edited catalog JSON is stored back in `app_catalog`; learners load the latest catalog from Supabase.

All display content is in `app_catalog.payload` in Supabase; [public/js/catalog.js](public/js/catalog.js) contains only code for loading and editing that database value. Admin-only row-level security protects catalog edits. Profiles and lesson progress are scoped to the signed-in user. Existing guest/localStorage progress is not automatically linked to a newly registered account.

The server exposes only the project URL and anon key. The service-role key is not used or exposed. Never commit `.env`; it is excluded by [`.gitignore`](.gitignore).

## Features

- English, Hindi and Marathi interface, learning prompts, quiz and speech synthesis.
- Seven learning paths, step-by-step lessons, safe practice simulations and a ten-question safety quiz.
- Senior mode, keyboard focus styles, responsive layouts and reduced-motion support.
- Browser speech recognition when available, with suggested questions and a text-input fallback.
- Supabase email sign-in, senior registration, admin-only catalog editing, and RLS-protected profiles/progress.

The app uses a matching browser voice when one is installed. If it is missing, the Express backend uses `node-edge-tts` and Microsoft Edge's online speech service with `en-IN`, `hi-IN` or `mr-IN` neural voices. This fallback requires an internet connection and sends the narration text to that service; do not use it for private text. Browser speech recognition still depends on microphone permission and browser support. The app does not make calls, send messages or move money.