# Inoverse design

How the Inoverse interface looks, why, and where each piece lives in the code.
Read this before changing the UI so new work matches what's there.

## The idea

You run the whole company by talking to Inovo. Inovo answers as one executive at a time
(CFO, CTO, Legal, …). The screen is a dark stage with one living object in the middle:
a **liquid-glass globe** that takes the colour of whoever is speaking and reacts when you
talk and when it talks. Everything else stays quiet, small and in the corners.

Principles:

- **Black, not dark grey.** The background is pure `#000`. Only the globe and the role give off colour.
- **One accent at a time.** The accent is always the current role's colour (`--role`). Never hard-code an accent colour.
- **Corners for information, centre for presence.** Text never covers the globe.
- **Always say who is speaking.** Every answer is tagged and announced with its role.
- **Calm by default, alive when talking.** Motion follows voice level; when idle, the screen barely moves.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ INOVERSE                               conversation list  │
│ Inovo, your AI cofounder               (newest at bottom) │
│ EN · اردو · Hands-free                  Open full chat →  │
│                                                           │
│                          ◯                                │
│                     liquid globe                          │
│                                                           │
│ SPEAKING AS              subtitles                        │
│ CFO                      status line          [features]  │
│ Finance & pricing        ( 🎙 Talk )                       │
└───────────────────────────────────────────────────────────┘
```

| Area | What | Class / component |
|---|---|---|
| Top-left | Name, tagline, language and Hands-free switches | `.brand`, `.toggles` |
| Top-right | Conversation list with role tags | `.feed` |
| Centre | The globe | `<Globe>` / `.globe` |
| Bottom-left | The role speaking now; click to pick a role | `.role`, `.role-picker` |
| Bottom-centre | Live subtitles, status line, Talk / Stop | `.stage-foot`, `<VoiceCaption>`, `.talk` |
| Bottom-right | Feature dock (Chat, Tasks, People, …) | `.dock` |
| Right edge | Slide-in panel for the open feature | `.drawer` |

The distance from the screen edge is one token everywhere: `--edge: clamp(16px, 3vw, 44px)`.

### Screen sizes

| Width | Change |
|---|---|
| ≥ 1000px with a panel open | The stage shrinks to the left of the panel (`right: var(--drawer-w)`); the conversation list hides, since the panel shows the full chat. |
| ≤ 1180px | The dock moves to bottom-centre; Talk and the role move up above it. |
| ≤ 760px (phones) | The globe is smaller and higher. The conversation list moves above the role and shows ~5 lines. Talk sits bottom-right. The dock spans the full width. |

## Colour

Tokens live in `:root` in [app/inoverse-black.css](app/inoverse-black.css).

| Token | Value | Use |
|---|---|---|
| `--vat`, `--vat-deep` | `#000` | Page and stage background |
| `--vat-raised` | `#0e0e11` | Cards, raised surfaces |
| `--woad` / `--woad-soft` | `#2c2c33` / `#1b1b20` | Borders and dividers |
| `--cotton` | `#f5f5f7` | Main text |
| `--cotton-dim` | `#8b8b96` | Secondary text, labels |
| `--madder` | `#ff5f73` | Errors, Stop |
| `--malachite` | `#6ff2c4` | Success |
| `--role` / `--role-2` | set per role | The accent and its deeper partner |
| `--turmeric` | `= var(--role)` | Legacy accent name; panels use it, so they follow the role automatically |

The odd names (`vat`, `woad`, `turmeric`, …) are kept from the first design so the older
panel CSS in `globals.css` keeps working. **Use the tokens, not raw hex values.** For a tint,
mix the role colour: `color-mix(in srgb, var(--role) 18%, transparent)`.

`--role` and `--role-2` are set as inline styles on `.app` from the current role, so changing
the role recolours the globe, the glow, the Talk button, tags, panel accents and selection in one step.

### Role colours

Defined in [lib/roles.js](lib/roles.js). `color` is the bright accent; `color2` is the deeper
colour used inside the globe and in the halo.

| Role | Area | `color` | `color2` |
|---|---|---|---|
| Cofounder (default) | Your all-round partner | `#d9dcff` | `#8b93ff` |
| CEO | Strategy & fundraising | `#b69bff` | `#6d4bff` |
| CTO | Tech & engineering | `#4cc9ff` | `#2a6bff` |
| CFO | Finance & pricing | `#ffcf5a` | `#ff8a1f` |
| CMO | Marketing & brand | `#ff7ac8` | `#c43dff` |
| COO | Operations & tasks | `#ff9b6a` | `#ff4d4d` |
| HR | People & hiring | `#5cf0b0` | `#14b8a6` |
| CPO | Product & roadmap | `#c2f25c` | `#5fae14` |
| CRO | Sales & revenue | `#3ee6d8` | `#0e8fa8` |
| CISO | Security & data | `#a9c1d9` | `#4a6a8c` |
| Legal | Contracts & compliance | `#ead7b0` | `#a8803c` |
| Chief of Staff | Inbox, links & errands | `#f2f2f2` | `#9a9aa8` |
| Investor | Gap check & evidence | `#ff6b7d` | `#d61f69` |

When adding a role, pick a hue that is clearly different from its neighbours on this list,
and check it is readable as text on black.

## Type

Loaded in [app/layout.jsx](app/layout.jsx) from Google Fonts.

| Token | Font | Use |
|---|---|---|
| `--display` | **Anton** (one weight, 400) | Bold headings: the name, the role, panel titles, headings inside panels |
| `--font` | **Futura** if installed, else **Jost** (free look-alike), then Century Gothic | All other text |

Sizes:

| Element | Size |
|---|---|
| Name "Inoverse" | `clamp(44px, 6.8vw, 104px)`, line-height 0.92 |
| Role name | `clamp(52px, 7vw, 112px)`; titles longer than 6 letters (`.long`) use `clamp(36px, 4.2vw, 68px)` |
| Panel title | 30px |
| Body | 15px (`--step-0`) |
| Conversation list | 14px, line-height 1.5 |
| Small labels (SPEAKING AS, YOU, INOVO) | 11px, uppercase, letter-spacing 0.08–0.1em |
| Role tags | 10px, weight 600, uppercase spacing 0.08em |

Anton is narrow and tall, so give it slight positive letter-spacing (0.01–0.03em), never negative.

## The globe

[components/Globe.jsx](components/Globe.jsx): a three.js sphere with a custom shader.

**Look:** dark glassy body with a swirl of the role colour inside, a thin-film rainbow rim
(like oil on water), and a bright highlight. A soft CSS halo (`.globe-halo`) in the role
colour sits behind it.

**States**, set from the app's voice state:

| State | Behaviour |
|---|---|
| `idle` | Slow breathing surface, colours drift slowly |
| `starting` / `listening` | Ripples run across the surface following your mic level; thin rings pulse outward (`.globe-rings`) |
| `thinking` | The liquid swirls faster, the colours spin, the globe turns faster, the halo breathes |
| `speaking` | The surface swells and wobbles with Inovo's voice level; the globe grows slightly on loud syllables |

The tuning numbers for each state are in the `LOOK` table at the top of `Globe.jsx`
(`amp`, `freq`, `speed`, `hue`, `glow`, `ripple`). Change those rather than the shader.

**Voice level:** read from `levelRef` (raw loudness about 0–0.2, scaled ×6). The browser's
fallback voice gives no level, so a gentle fake talking pulse is used instead.

**Mouse tracking:** the globe turns toward the pointer, drifts slightly after it, and the
highlight moves to face it. Movement is eased, and the globe settles back to the centre
when the pointer leaves the window. The halo trails a little further than the globe
(`--mx`, `--my` CSS variables) for depth.

**Colour change:** when the role changes, the globe colours blend over about a second; nothing snaps.

**Fallback:** without WebGL the wrapper gets `.globe-flat` and CSS draws a plain glowing sphere.

**Performance:** the mesh is an icosahedron at detail 52. Raise it only if you have
tested on a laptop with built-in graphics.

## Conversation list (top-right)

- The newest message is at the bottom, older ones above. Up to 14 messages are shown.
- Each message has a label and a role tag:
  - Inovo's answers: `INOVO` + the role that answered, e.g. **● CFO**, in that role's colour.
  - Your messages: `YOU` + the role it went to, e.g. **● TO CFO**.
  - Hovering a tag shows the full role, e.g. "Answered by CFO: Finance & pricing".
- Text is plain (markdown removed) and cut at 180 characters; "Open full chat →" opens the Chat panel.
- **Everything stays readable.** The only effects are:
  - a soft blur strip along the bottom edge (`--edge-blur: 34px`, 24px on phones), so the list melts into the black;
  - a short fade on the topmost 15% so the oldest line isn't cut off sharply.
- Before the first message, the list shows clickable example questions instead.

## Role corner (bottom-left)

- "SPEAKING AS", then the role name in Anton in the role colour with a soft glow, then its area.
- The role changes by itself when an answer arrives (from the skill that answered) or when
  you open a panel (Tasks → COO, People → CRO, Simulate → CMO, Evidence/Tests → Investor,
  Weekly → COO, Company → CEO).
- Clicking the name opens `.role-picker`, a list with a coloured dot for each role. Picking
  one changes only the colours; the next question still goes to whichever executive fits.

## Who is speaking

Every answer announces its role, both spoken and on screen:

- **Voice:** the server adds "CFO here." (Urdu: "CFO baat kar raha hai.") to the start of
  what is said. See `announce()` in [app/api/cofounder/route.js](app/api/cofounder/route.js).
- **Model prompt:** the model is told which role it speaks as and *not* to introduce itself,
  so the title is never said twice. See `buildSystemPrompt()` in [lib/skills.js](lib/skills.js).
- **Screen:** the globe colour, the role corner, tags in the conversation list, and a
  coloured tag on each answer in the Chat panel.

Skill → role mapping is `SKILL_ROLE` in [lib/roles.js](lib/roles.js).

## Landing page

[components/LandingPage.jsx](components/LandingPage.jsx) + [app/landing.css](app/landing.css).
Shown first at `/`; "Start talking" or "Launch Inovo" opens the app and adds `#app` to the
address, so a reload goes straight to the app and Back returns to the landing page
(see [app/page.jsx](app/page.jsx)). Returning from Google sign-in skips the landing page.

**One globe travels with the page.** A single `<Globe>` is fixed behind all the content
(`className="globe-stage"`) and gets a `motionRef`. Each section has a scene in `SCENES`:

| Section | Globe | Colour |
|---|---|---|
| Hero: "This isn't a chatbot. It's your whole C-suite." | right, large, melted | cycles CFO → CTO → Legal → CMO → HR → CRO → CEO; "Speaking as" bottom-left |
| Statement: "Inovo doesn't just reply. It runs the room." | left, medium, fully melted | CMO |
| Meet your executives (12 role cards) | top-right, small | the hovered role, else CEO |
| We gave Inovo a shape | centre, large, almost round | cycles idle → listening → thinking → speaking; click a state to hold it |
| What it does (6 feature cards) | bottom-left, small, melted | CTO |
| Close: "You're not hiring a bot. You're meeting your team." | centre | Cofounder |

Between sections the globe's position, size, turn and melt are blended with the scroll
(smoothstep), and the globe glides to them. Fast scrolling adds `energy`, which makes the
liquid wobble and then settle. The globe still follows the mouse. On phones it stays near
the centre behind the text, and each section gets a dark gradient for readability.

**Motion `motionRef` fields:** `x`, `y` (fraction of half the screen), `scale`, `rot`
(radians), `blob` (0 = sphere, 1 = organic liquid blob), `energy` (0–1 wobble burst).
The app's globe passes no `motionRef` and behaves as described under "The globe".

**Sequence:** loader (black, a big Anton percentage bottom-right counting to 100% while
the fonts load) → the globe fades in and grows into place → hero text fades up in steps →
sections fade up as they scroll in → on "Start talking" the globe swells to fill the screen,
the page fades out and the app's own entrance plays.

**Rules:** no logo walls, testimonials or numbers we can't back up; every claim on the page
must match a feature the app has.

## Controls

- **Talk:** a pill with a thin role-coloured border, a faint glass fill and a soft glow.
  It brightens on hover. While recording or speaking it becomes **Done** / **Stop** in red.
- **Dock:** icon + small label buttons on a dark glass bar. The open one gets a light fill and
  a role-coloured inner outline. A pulsing dot on Chat means Inovo is thinking.
- **Switches** (EN / اردو / Hands-free): plain text; the active one gets a thin outline.
- **Panels:** a near-black glass drawer (`rgba(8, 8, 10, 0.94)`) sliding in from the right,
  width `min(520px, 100vw)`, title in Anton. Primary buttons (`.btn`) are white with black text.

## Motion

- On load, the globe scales in from a blur (1.6s), then the name, conversation list, role
  and dock fade up one after another (0.3s, 0.5s, 0.7s, 0.9s delays).
- New messages fade up 8px.
- Role changes: colours ease over ~0.8s.
- **Reduced motion:** with the system setting on, entrance animations and listening rings
  are switched off, the globe moves at about a third of the strength, and mouse tracking is
  gentler.

## Files

| File | What |
|---|---|
| [app/inoverse-black.css](app/inoverse-black.css) | This design: tokens, layout, globe, list, role, controls. Loaded after `globals.css`, so it wins. |
| [app/globals.css](app/globals.css) | Older base styles, mostly the panels. Its old cyan colours now point at the role colour. It still contains unused rules from the previous hologram look (`.hud-*`, `.landing-*`, `.voice-core`, `.loom`). |
| [app/landing.css](app/landing.css) | The landing page. |
| [components/LandingPage.jsx](components/LandingPage.jsx) | The landing page: loader, sections, scroll-driven globe. |
| [app/page.jsx](app/page.jsx) | Shows the landing page, then the app. |
| [app/layout.jsx](app/layout.jsx) | Fonts and the stylesheet order. |
| [components/Globe.jsx](components/Globe.jsx) | The globe. |
| [components/CofounderApp.jsx](components/CofounderApp.jsx) | Stage layout, conversation list, role corner, dock, panels. |
| [lib/roles.js](lib/roles.js) | Roles, colours, skill → role and panel → role mappings, the spoken intro. |
| [lib/skills.js](lib/skills.js) | The skill list the router chooses from, and the "who is speaking" prompt. |
| [skills/](skills/) | One file per skill, including the C-suite executives. |

The previous design's components (`HudScene.jsx`, `VoiceCore.jsx`, `Landing.jsx`,
`Loom3D.jsx`) are still in `components/` but are no longer used. (`Landing.jsx` is the old
video intro; the current landing page is `LandingPage.jsx`.)

## Adding a role

1. Add it to `ROLES` in [lib/roles.js](lib/roles.js) with a `key`, short `label`, `area`, `color` and `color2`.
2. Map its skill in `SKILL_ROLE` (and a panel in `PANEL_ROLE` if one fits).
3. If it has its own skill, add `skills/<name>.md` and an entry in `SKILLS` in [lib/skills.js](lib/skills.js).
4. Add a row to the role colour table above.

## Don'ts

- Don't add a second accent colour; use `--role`.
- Don't put text or controls over the globe.
- Don't blur or hide the newest messages.
- Don't use Anton for body text or small labels.
- Don't add a background image or video behind the globe; the black is part of the design.
