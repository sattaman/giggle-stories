# Hosting plan: putting Storytime online for feedback (2026-09-25)

**Goal:** let a small group of invited families try Storytime on the web (and later on phones).
Each parent signs in with Google and sees only their own stories, unless they share a story through a unique link.

Status: proposal. Nothing here is built yet. Vendor pricing and platform rules marked _(check)_ haven't been verified.

## 1. What breaks when it goes online

| Today | Problem online |
|---|---|
| No auth. `GET /v1/stories` lists every story (`packages/server/src/http.ts`) | Anyone can see everyone's stories |
| Audio is served publicly at `/v1/audio/:story/:file` with `cache-control: public, immutable` | Anyone with the URL can play it, and story IDs aren't secret |
| `cors({ origin: true })` | Any website can call the API |
| Data is SQLite checkpoints, `stories.jsonl` and audio files in `data/` on local disk | Needs a persistent disk or a real database |
| Progress is an in-memory `live` map, and graph steps run in the background | Breaks with more than one server instance, or on a host that freezes the CPU between requests |
| **TTS quota: about 10 stories a day in total** (see CLAUDE.md) | **The biggest blocker.** A handful of testers would use it up in a morning |
| LangSmith (EU region) receives children's ideas | Fine for our own family, not for other families' children (UK Children's Code) |

**Already in our favour:**
- The API is bearer-token-ready, with no cookie sessions (plan §8a.5), so web and mobile share the same auth.
- The server does all the work, so no secrets ship to the client.

## 2. Design

### Who signs in
- **The parent signs in with Google, never the child.** This keeps us on the right side of the children's-data rules.
- **Beta allowlist:** only invited emails can create stories. This protects the TTS quota and the bill.

### Ownership
- A `stories` table replaces `stories.jsonl`:
  ```
  stories { id, owner_id, created_at, age_band, share_token (nullable, unique), shared_at (nullable) }
  ```
- Every `/v1/stories/:id` route checks `owner_id` **before** touching the graph. The `thread_id` stays the story ID.
- `GET /v1/stories` filters by owner.
- The server verifies the provider's JWT on every request (`Authorization: Bearer …`) and validates its claims with zod.

### Share links
- "Share" creates a random 128-bit token, giving a link like `https://<host>/s/<token>`.
- `GET /v1/shared/:token` returns a **read-only** view:
  - it plays the story, but can't reply, revise or perform;
  - it never shows the owner's email.
- Revoking a share sets `share_token` back to null. Sharing again creates a new token.

### Audio
- An `<audio>` element can't send a bearer header, so audio uses **short-lived signed URLs**. There are two ways to do this:
  - object-storage signed URLs (Supabase Storage or GCS);
  - an HMAC-signed `?t=` token that our own `/v1/audio` route checks.
- Drop `public, immutable` caching for story audio.
- The narrator voice and the voice library stay global and shared.

### Abuse and cost controls
- A per-user daily story limit, enforced server-side.
- A global circuit breaker when the TTS quota runs out, with a friendly "come back tomorrow" message.
- Lock CORS down to our own origin.

## 3. Service options

| Option | Auth | Data and audio | Verdict |
|---|---|---|---|
| **Supabase** | Google login; we verify its JWTs in Fastify | Postgres (LangGraph `PostgresSaver` plus the `stories` table) and Storage with signed URLs | **Recommended.** One vendor covers all three, it matches the plan's move to Postgres, and it has a decent Expo SDK |
| Firebase Auth + GCP (Cloud Run, Cloud SQL, GCS) | Google login | Separate services to wire up | The most Google-native option, since we already use Gemini, but more setup. Cloud Run needs CPU always allocated and `min-instances=1` because of the background runs |
| Clerk | Nicest ready-made login UI and Expo support | Still needs a database and storage | Good if we don't want to build any login UI |
| LangSmith Deployment (LangGraph Platform) | Custom auth with per-user thread ownership | Hosts the graph and its persistence | The "all-in on LangChain" option. Audio and TTS serving would still need our own service, and there are trade-offs in pricing and control _(check)_ |

### Hosting the server
- Use **one always-on container** on Fly.io, Railway or Render. That's the simplest setup that works with background graph runs and the in-memory progress map.
- Fastify also serves the **Expo web export**. With one origin there's no CORS, and deployment is simpler.
- **Minimal variant:** keep SQLite on a Fly volume and add only Supabase or Firebase Auth. It's quicker, but a dead end once we need more than one instance.

## 4. Mobile

- For early feedback, testers use the **web app on their phones**. There's no app-store work.
- Later:
  - Native Google sign-in needs an Expo dev build (it won't work in Expo Go).
  - If the iOS app offers Google login, Apple generally requires Sign in with Apple as well _(check the current App Store guideline 4.8)_.
  - Distribute through TestFlight and Play internal testing. This needs an Apple developer account.

## 5. Privacy before other families use it

- Move to an **EU LangSmith** account, or hide trace inputs and outputs for production traffic.
- Write a short privacy note for parents: what we store, where, and for how long.
- Add a "delete my data" action that removes stories, checkpoints and audio.
- Keep the existing rules: first names only, and raw recordings are deleted after transcription.
- Before inviting anyone, run the Astra A3 prompt (`docs/reviews/review-plan.md`) on the UK Children's Code.

## 6. Effort (rough, evenings with an agent)

| Step | Effort |
|---|---|
| Google login on web, JWT check in Fastify, ownership checks, allowlist | 1–2 days |
| `PostgresSaver`, `stories` table, audio in object storage with signed URLs | 1–2 days |
| Share links and the read-only share view | about 1 day |
| Dockerfile, hosting, secrets, domain, locked-down CORS | about 1 day |
| Per-user daily limits, plus sorting out the TTS quota tier | half a day, plus waiting on Google |
| Privacy basics (§5) | about 1 day |
| Native mobile login and TestFlight / Play internal testing | 1–3 days, later |

That's **about a week of evenings** for a shareable web beta.

## 7. How this fits the LangChain learning plan

Replacing the in-memory progress map with LangGraph streaming (`streamMode: ["updates","custom"]`) is what makes the deployment robust. So:

1. Send the Astra prompts A1 (LangGraph idioms) and A3 (privacy) for an outside review now.
2. Do learning steps 1–4 (Studio, checkpoints and time travel, LangSmith debugging, node and adapter tests) locally.
3. Build auth, Postgres, sharing and deployment, folding in the streaming-progress change.

## 8. Open decisions

- [ ] Supabase or Firebase/GCP, and which host.
- [ ] Can the Gemini project move up a TTS quota tier? This decides how many testers we can have.
- [ ] EU LangSmith account, or hidden inputs in production.
- [ ] Domain name.
- [ ] Record the final choices as an ADR in `docs/adr/`.
