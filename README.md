# Inoverse

Inoverse is the app; Inovo is its voice AI cofounder for Inovix, who checks the gaps before you build. It runs on Gemma and stores everything in Supabase.

At its centre is a 3D sphere woven from threads, in gold and indigo like cloth on a Faisalabad loom. The threads ripple with your voice, tighten while it thinks, and pulse while it speaks. Five reviewers orbit it. After a gap check, each reviewer moves closer the higher it scored, and the weave turns the colour of the verdict.

---

## Setup (about 15 minutes)

You need **Node.js 20 or newer** and **Chrome or Edge**.

```bash
npm install
cp .env.example .env.local
```

### 1. Configure Gemma (required)

1. Go to **https://aistudio.google.com** and sign in with a Google account.
2. Click **Get API key** → **Create API key**. Copy it.
3. In `.env.local`, set:
   ```
   GEMINI_API_KEY=your-key
   ```
4. The default model is `gemma-4-31b-it`. If answers are slow or you hit rate limits, add:
   ```
   GEMMA_MODEL=gemma-4-26b-a4b-it
   ```
   If the main model is down on Google's side, the app switches to `gemma-4-26b-a4b-it` for 5 minutes by itself (`GEMMA_FALLBACK_MODEL`, or `off`).
5. Voice input (the Talk button) is transcribed with `gemini-3.5-flash` on the same key, because Gemma 4 31B cannot take audio. To change it, set `TRANSCRIBE_MODEL`.
   Everyday conversation uses the quicker `gemma-4-26b-a4b-it` with minimal thinking so spoken replies come back in seconds (`GEMMA_FAST_MODEL`). The gap check and weekly review use `GEMMA_MODEL`.
6. The cofounder answers out loud with `gemini-3.8-flash-tts` (voice `Charon`). Change with `TTS_MODEL` and `TTS_VOICE`. When you ask by voice, it listens again after answering, so you can keep talking; stay quiet for 10 seconds or press Stop to end.

That's enough to talk to the cofounder. Without Supabase it reads `data/company-context.md` and saves nothing.

### 2. Connect Supabase (to save evidence, tests and reviews)

1. Go to **https://supabase.com** → **New project**. Pick a name, a database password, and the region nearest to you. Wait for it to finish setting up.
2. Open **SQL Editor** → **New query**. Paste all of `supabase/schema.sql` and click **Run**. You should see "Success. No rows returned".
3. New query again. Paste `supabase/seed.sql` and click **Run**. This adds Inovix's details, you as the first team member, and your five products.
4. Open **Project Settings** → **API** (or **API Keys**). Copy:
   - the **Project URL** → `SUPABASE_URL`
   - the **service_role** key (on newer dashboards, the **secret** key) → `SUPABASE_SERVICE_ROLE_KEY`
5. Add both to `.env.local`.

The service role key can read and write everything. It stays on the server and is never sent to the browser. Never commit `.env.local` or paste this key into the frontend.

All tables have Row Level Security switched on with no policies, so the public "anon" key can't read anything. Only the app's server can.

### 3. Run it

```bash
npm run dev
```

Open **http://localhost:3000** and allow the microphone. If something is missing, a yellow notice at the top of the panel says exactly what to fix. Once everything is configured, the notice disappears.

Open the **Company** tab and add your teammate (name and role). The cofounder assigns tasks only to people listed there.

### 4. Connect Gmail for tasks (optional, about 15 minutes)

Inovo can read your upcoming tasks from email. It reads **only** emails whose subject starts with **Inovo**, for example `Inovo: pitch at NIC on Friday 3pm`. Gemma turns each one into a task with a due date, and Inovo reads your upcoming tasks before every answer.

1. In Supabase → **SQL Editor** → **New query**, paste all of `supabase/tasks.sql` and click **Run**. (New installs get these tables from `schema.sql` already.)
2. Go to **https://console.cloud.google.com** → create a project called **Inoverse**.
3. **APIs & Services** → **Library** → search **Gmail API** → **Enable**.
4. **Google Auth Platform** (or **OAuth consent screen**) → **Get started**: app name **Inoverse**, your email as support email, audience **External**. Under **Audience** → **Test users**, add your Gmail address.
5. **Clients** (or **Credentials** → **Create credentials** → **OAuth client ID**) → type **Web application**. Under **Authorized redirect URIs** add `http://localhost:3000/api/google/callback` (and `https://<your-domain>/api/google/callback` if you deploy).
6. Copy the **Client ID** and **Client secret** into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
   Restart `npm run dev`.
7. Open the **Tasks** tab → **Connect Gmail** → sign in. Google will warn that the app isn't verified; click **Continue**. It's your own app.

Inoverse checks for new Inovo emails when it opens and every 5 minutes while it stays open. You can also add tasks by hand in the Tasks tab.

While the Google app is in **Testing** mode, Google ends the sign-in after 7 days. When that happens the Tasks tab asks you to connect again.

### 5. Deploy (optional)

1. Push the project to GitHub and import it in **Vercel**.
2. In Vercel → **Settings** → **Environment Variables**, add `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Add `ACCESS_CODE` with a code of your choice. Anyone opening the link must enter it once, so strangers can't use your Gemma quota or read your company data.

---

## Test it

1. Type **"How should we price Wattly?"** → a pricing answer in PKR, read aloud.
2. Click **Talk** and say **"I want to build a fabric defect app for small mills. Check the gaps first."** → the weave tightens while thinking (up to 40 seconds), then a verdict card appears, the reviewers move by score, and the weave takes the verdict's colour.
3. Open **Tests** → the 48-hour test from that gap check is waiting. Set it to Passed or Failed, add notes, save → it also appears in **Evidence**.
4. Open **Evidence** → add a real customer conversation. Run the gap check again; the Investigator now uses it.
5. Open **Weekly review** → add a commitment, write a short update for each person, run the review → health score, one goal and tasks, read aloud.
6. Say **"Open YouTube"** or **"WhatsApp kholo"** → a new tab opens. If Chrome blocks it, use the button in the chat or allow pop-ups for the site once.
7. Switch to **اردو** and ask something → it listens in Urdu and answers in Roman Urdu.
8. Reload the page → the conversation is still there.

---

## How it works

```
Browser: 3D weave + voice + panel
   │  mic recording            POST /api/speak (Gemini TTS: text → voice)
   ├─ POST /api/transcribe (Gemini 3.5 Flash: speech → text)
   ▼
POST /api/cofounder
   ├─ website command? ──► open a tab (no AI)
   ├─ Gemma router picks a skill
   │     ├─ everyday skill ──► 1 Gemma call with company context
   │     └─ gap check ───────► brief → 5 reviewers in parallel → verdict in code
   │                            → 48-hour test → Judge → saved + test created
   └─ conversation saved
Company context = Supabase (profile, team, products, commitments, open tests, evidence)
                  or data/company-context.md when Supabase isn't connected
```

Logging a test result as passed or failed files it as evidence, so each gap check learns from the last real test.

## API

All routes return JSON. When `ACCESS_CODE` is set, send it in the `x-access-code` header.

| Route | Does |
| --- | --- |
| `POST /api/cofounder` | Talk: `{ message, history?, lang? }` → `{ skill, say, details, gapCheck?, experimentId?, action? }` |
| `GET /api/messages` | Last 30 messages, oldest first |
| `GET, POST /api/evidence` · `DELETE /api/evidence/:id` | Evidence the Investigator uses |
| `GET /api/experiments` · `PATCH /api/experiments/:id` | 48-hour tests and gap-check history; passed/failed results become evidence |
| `GET, POST /api/commitments` · `PATCH, DELETE /api/commitments/:id` | Commitments for the weekly review |
| `GET, POST /api/weekly-review` | Run a review (health score computed in code) and list past ones |
| `GET, PUT /api/company` | Company name and description, team, products |
| `POST /api/team` · `DELETE /api/team/:id` | Team members |
| `POST /api/products` · `PATCH, DELETE /api/products/:id` | Products and their stage |
| `GET /api/status` | What's configured (never returns secrets) |

## Files

| Path | Purpose |
| --- | --- |
| `components/Loom3D.jsx` | The woven 3D core and the five orbiting reviewers (three.js, custom shaders) |
| `components/CofounderApp.jsx` | Voice, microphone level, chat, verdict card, tabs |
| `components/Panels.jsx` | Evidence, Tests, Weekly review, Company tabs |
| `app/globals.css` | Colours and type (Bricolage Grotesque) |
| `app/api/**` | The routes above |
| `lib/gemma.js` | Gemma client |
| `lib/skills.js`, `skills/*.md` | Skill router and the four skills |
| `lib/gapCheck.js` | The five-reviewer gap check |
| `lib/verdict.js`, `lib/cheapestTest.js`, `lib/commitmentHealth.js` | Scoring in plain code |
| `lib/openIntent.js` | Website and search commands |
| `lib/db.js`, `lib/store.js`, `lib/context.js` | Supabase access and the company context |
| `supabase/schema.sql`, `supabase/seed.sql` | Database tables and starting data |

## Known limits

- Voice input needs a browser that can record audio (Chrome, Edge, Firefox, Safari). Typing works everywhere.
- Few computers have an Urdu voice, so Roman Urdu is read by an English voice.
- The Investigator has no web search; it uses only the Evidence tab.
- A gap check makes 8 Gemma calls and takes 15–40 seconds.
- Website commands open browser tabs only, not desktop apps or files.
- One company per deployment for now (`COMPANY_SLUG`, default `inovix`).

## Credits

- Skills adapted from [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) (MIT, see `LICENSE-claude-skills-MIT.txt`): roast, weekly-review, pricing-strategist, solo-founder persona. Rewritten for Gemma and Pakistan; scoring ported from Python to JavaScript.
- Skill format: the Agent Skills standard ([anthropics/skills](https://github.com/anthropics/skills)).
- 3D: [three.js](https://threejs.org) (MIT). Font: Bricolage Grotesque (SIL Open Font License).
- The voice interface, 3D design, API and gap-check pipeline are original. No code from FatihMakes' Mark assistants is used (CC BY-NC, non-commercial only).
