# vanshajkakkar.com

Source for [vanshajkakkar.com](https://vanshajkakkar.com): static portfolio pages plus an
"ask about my work" agent with a hand reviewed answer cache, a budget and graceful fallback.

Zero dependencies. No package.json, no install, no lockfile. Node built-ins only, so
`node server.mjs` is the whole thing on a clean machine with Node 20 or newer.

## The rule the whole thing is built around

> An attacker gets limited. A visitor never sees a limit. The site itself can never be down.

There is no state in which a visitor is shown "unavailable", "rate limited", "quota
exceeded" or an error. Every limit, every provider failure and every spent budget degrades
silently to a hand reviewed cached answer or to the prepared refusal, rendered exactly like
any other answer. If you find a code path that shows a visitor a failure, that is a bug.

## Running it

### Bare node

```sh
node server.mjs
# then open http://localhost:4321
```

With no `OPENAI_API_KEY` set this still works completely. Every question is answered from
`data/answers.json`, and anything the cache does not cover gets the prepared refusal. That
is the same path the demo takes in production once the monthly budget is spent, so running
with no key is a real test of the degraded path rather than a crippled mode.

`PORT` overrides the listen port if 4321 is taken.

### Docker

```sh
docker build -t vanshajkakkar-site .
docker run --rm -p 4321:4321 vanshajkakkar-site

# with a key
docker run --rm -p 4321:4321 --env-file .env vanshajkakkar-site
```

### Docker Compose

```sh
cp .env.example .env      # then fill it in, or leave it blank
docker compose up --build
```

Compose reads `.env` if it exists and does not mind if it does not. A variable already set
in your shell wins over the one in `.env`.

## Where the key goes

`OPENAI_API_KEY`, in `.env`, which is gitignored. Nowhere else.

The key is read by the server process only. It is never sent to the browser, never written
to a log, never returned in a response and never baked into the image. The boot line says
whether a key is set, not what it is. `.env.example` is the documented template and holds
no real value.

## Cost model

`DEMO_MODEL` defaults to `gpt-5-nano`, the cheapest current OpenAI text model at $0.05 per
1M input tokens and $0.40 per 1M output. `gpt-5-mini` and `gpt-5` are also priced in
`server.mjs` if you want to trade cost for quality.

The whole corpus goes in the prompt. About a dozen short answers is a couple of thousand
tokens, so there is nothing for a vector database to do here, and reaching for one would be
the wrong signal. That is a deliberate decision, noted in the code.

Measured, not estimated:

| Line | Figure |
|---|---|
| System prompt, including the whole corpus | 6,679 characters, roughly 1,700 tokens |
| Output cap, control 9 | 400 tokens |
| Input cost per model call | about $0.000085 |
| Output cost per model call, at the cap | $0.00016 |
| **Cost per 1,000 questions that all reach the model** | **about $0.15 typical, $0.25 if every answer ran to the 400 token cap** |
| Model calls needed to reach the $15 kill switch | roughly 61,000 |

That is the worst case, where every question is novel. In practice the cache absorbs most
traffic at exactly zero, so cost scales with novelty rather than with traffic. A bot asking
the same question ten thousand times costs nothing and gets a real answer every time, which
also makes it uninteresting to attack.

Spend is booked from the `usage` object the provider returns, not from an estimate, so the
figure in the public cost panel is true.

## Which controls are real here, and which are not

This is the honest split. The prototype implements the application half of the guardrail
stack. The edge half does not exist until this is deployed behind Cloudflare, and several
controls are load bearing only once it is.

| # | Control | Local, in this repo | Deployed, at the edge |
|---|---|---|---|
| 1 | Deliberate open, never on the first screen | **Real.** `demo.js` builds the panel closed, as the last section before the footer | Same code |
| 2 | Turnstile | **Stubbed.** No widget, no verification. `demo.js` sends `null`, so everything draws from the small unverified pool | Worker calls siteverify, single use, bound to the session id |
| 3 | Origin and referer check | **Not implemented.** The server does not look at either header | Worker |
| 4 | Input length cap, 500 characters | **Real**, both sides, plus an 8 KB hard cap on the request body | Same |
| 5 | Turn cap, 8 per session | **Real**, carried in the signed token | Same |
| 6 | Session length cap, 3 minutes | **Partly.** The token expiry is enforced. The visible countdown is not built | Same, plus the countdown |
| 7 | Per-IP soft limit, 3 per day | **Shape only.** It reads `CF-Connecting-IP` and falls back to the socket address. With no Cloudflare in front, a local client can simply send that header itself | Real. Cloudflare sets the header at the edge and a client cannot forge it |
| 8 | Split verified and unverified pools | **Shape only**, because it depends on control 2 | Real |
| 9 | Output token cap, 400 | **Real** | Same |
| 10 | Audio duration cap | **Not built.** There is no speech layer in this rung | Rungs 2 and 3 |
| 11 | Neuron budget watch | **Not built.** No Workers AI here | Worker, scheduled |
| 12 | Monthly budget kill switch, $15 | **Real**, but in memory, so a restart resets it | Workers KV, durable |
| 13 | Server side key handling | **Real** | Same |
| 14 | Edge WAF and bot score | **Nothing.** This is the highest leverage control in the spec and none of it exists locally | Cloudflare, before the Worker runs |
| 15 | Answer cache | **Real**, static JSON. The semantic cache of already answered novel questions is not built | Static JSON plus KV |
| 16 | Signed session token, HMAC | **Real.** With `DEMO_SECRET` unset the key rotates every boot, which silently invalidates open sessions | Same, with a rotated secret |
| 17 | Graduated friction | **Partly.** Cache only degradation is real. Added latency and the interactive challenge are not built | Full ladder |

Two things worth saying plainly rather than burying:

- **Every counter is in process memory.** Restart the server and every cap resets. In
  production these are Workers KV keys with TTLs.
- **Locally there is no edge, so there is no cheap first line of defence.** Layer 1 of the
  spec, where abusive requests are blocked before they reach any code or cost anything, is
  the single biggest control in the design and it is entirely absent until deployment. Do
  not read a working local prototype as a working security posture.

## Layout

| Path | What |
|---|---|
| `server.mjs` | The local stand-in for the Cloudflare Worker. Every control maps one to one onto it |
| `data/answers.json` | Layer 2. Hand reviewed answers, served free, no model call, no rate limit |
| `public/` | The static site. Renders complete with JavaScript disabled |
| `public/assets/demo.js` | The demo panel. Progressive enhancement, no framework, no dependencies |
| `public/assets/site.css` | The design system. Demo styles are appended under `/* demo panel */` |

## API

| Route | What |
|---|---|
| `POST /api/ask` | `{question, session, turnstile}`. Returns `{answer, source, session, panel}`. `source` is `cache`, `model`, `refusal` or `control`, and the panel tags each answer honestly as cached or live |
| `GET /api/suggestions` | The opening question chips, each one checked against the same matcher the ask path uses so a suggestion can never miss the cache |

The `session` token is signed by the server with HMAC SHA256. The client carries it back
untouched on every request and cannot read or forge it, so it cannot reset its own turn
count.
