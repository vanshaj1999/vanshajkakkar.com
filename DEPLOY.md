# Deploy: where this runs, and how it gets there

26 August 2026. Answers the two questions: where does the website run, and where does the domain
come from.

---

## The short answer

| Thing | Answer | Cost |
|---|---|---|
| **Domain** | **Cloudflare Registrar**, at cost | **$10.44/year** for a `.com`, same price on renewal |
| **Hosting** | **Cloudflare Pages**, connected to your personal GitHub repo | **$0**, unlimited bandwidth |
| **The demo backend** | **Cloudflare Pages Functions**, which are Workers | **$0** within the free tier |
| **Speech, later** | **Cloudflare Workers AI** | **$0** inside 10,000 neurons/day |
| **The model** | **Your own OpenAI key**, `gpt-5-nano` | pennies, see below |
| **Analytics** | Cloudflare Web Analytics, no cookie banner needed | $0 |
| **Total** | | **about $10.44/year plus a few dollars of OpenAI** |

Everything sits in one Cloudflare account: registrar, DNS, hosting, functions, KV, WAF, analytics.
One bill, one dashboard, one place to revoke.

---

## 1. The domain

**`vanshajkakkar.com` was verified available on 26 August 2026** against Verisign RDAP. The lookup
endpoint was validated against a known-registered domain in the same session, so the not-found was
real and not a broken query. Availability changes without warning, so register it early.

**Get it from Cloudflare Registrar.** They pass through the exact registry fee plus the mandatory
$0.18 ICANN fee and add no markup, which is $10.44 a year for a `.com`. The renewal price is the same
as the registration price, so there is no year-two jump. WHOIS redaction is included where the
registry permits it.

The one condition: Cloudflare Registrar requires the domain to use Cloudflare nameservers. That is
not a constraint here, because the site is hosted on Cloudflare anyway.

**Take `vanshajkakkar.dev` at the same time** if it is free. A few dollars, it forces HTTPS, and it
stops someone standing up a site on your name later. Point it at the same place.

At registration: turn on registrar lock, turn on auto-renew, and decide `www` versus apex once and
permanently redirect the other, so links you hand out never split.

**Alternatives, if you want to compare:** Porkbun and Spaceship are competitive on first-year price.
Cloudflare wins on renewal because at-cost never rises to a retail rate, and on convenience because
everything else is already there.

---

## 2. Where the site runs

**Cloudflare Pages, deployed from your personal GitHub repo.**

- Push to `main`, Cloudflare builds and deploys. No CI to write.
- Unlimited free static egress. If the site gets forwarded around Slack after a good launch, that
  costs nothing. This is the reason Pages beats Vercel and Netlify here.
- Preview deployments on every branch, so a case study can be reviewed before it goes live.

**Why not the alternatives:**

- **GitHub Pages** cannot run the demo backend. There is nowhere to put the OpenAI key that is not
  the browser, and a key in the browser is a key that is gone. Static only, so it is out.
- **Vercel Hobby forbids commercial use**, and a site whose purpose is to get you hired is arguably
  commercial. The paid tier is $20/month for something Cloudflare does free.
- **Netlify** is now the weakest of the three on bandwidth value.

### The demo backend

The prototype runs `server.mjs`, a plain Node server, so it works on localhost and in Docker with no
account anywhere. **For deploy, that same logic moves to `functions/api/ask.js`**, a Pages Function,
which is a Worker. The port is mechanical: same controls, same cache, same refusal path, with
in-memory state swapped for Workers KV so the counters survive across requests and instances.

Keep both. The Node server stays the local development path, so the site can always be run and
demoed with no cloud account and no key.

### AWS, Azure or Google Cloud instead?

All three can host this. None of them is cheaper or simpler for a site of this shape, and one of them
costs roughly seven times more once the security layer is switched on.

| | What it would be | Yearly cost | The catch |
|---|---|---:|---|
| **Cloudflare Pages** *(chosen)* | Pages, Pages Functions, KV, WAF, analytics, registrar | **~$10.44** | Everything in one account. WAF, bot rules, rate limiting and unlimited egress are all in the free tier |
| **AWS** | S3 plus CloudFront plus a Lambda function URL, Route 53, ACM | **~$6 to $66** | Route 53 hosted zone is $0.50/month. Fine until you want a WAF: **AWS WAF is $5/month per web ACL plus $1/month per rule**, so the security layer alone is more than five times the whole Cloudflare bill |
| **Azure** | Static Web Apps free tier with managed Functions | **~$0 to $60** | The free Static Web Apps tier has no SLA and no custom WAF. Adding Front Door with WAF is about $35/month at the low end. Also nothing here he can point at as prior evidence |
| **Google Cloud** | Firebase Hosting plus Cloud Functions | **~$0 to $70** | Same story: hosting is free, then Cloud Armor is $5/month per policy plus $1/month per rule |

**The one real argument for AWS** is that a portfolio site running on AWS is itself a talking point in
an interview for an AWS role. That argument does not survive contact with the case studies. The work
already carries far heavier AWS evidence than a static site ever could: a live ingest path on
CloudFront and API Gateway into Lambda, four distinct Lambda packaging strategies including a
container image from ECR, ECS Fargate behind CloudFront, RDS, S3 and SES across nineteen
distributions. Hosting a personal site on S3 proves none of that. The projects do.

So: Cloudflare for the site, and AWS stays where it earns its keep, in the work being described.

Two caveats worth stating rather than discovering later.

- **The OpenAI key never touches AWS or the browser.** It lives as an encrypted environment variable
  on the Pages project, read only inside the Worker.
- **Moving later is cheap.** The backend is one file, `functions/api/ask.js`, and the front end is
  static. If there is ever a reason to move to AWS, it is a Lambda function URL and an S3 sync, not a
  rewrite.

---

## 3. Zero to live

The site is deploy-ready. Everything below in "yours" needs one of your accounts, so it cannot be
done from here. Everything in "done" is finished and verified.

### Step 1, the domain (5 minutes, $10.44)

Register `vanshajkakkar.com` at Cloudflare Registrar. Take `.dev` at the same time if it is free.
Turn on registrar lock and auto-renew at registration.

### Step 2, the repo (5 minutes)

`site/` is the repo root, not `professional/`. From inside it:

```
git init
git add .
git commit -m "Add portfolio site"
git branch -M main
git remote add origin git@github.com:<your-user>/vanshajkakkar.git
git push -u origin main
```

**Check `git status` before the first commit.** `.gitignore` deliberately excludes `.env`,
`cv-requests.jsonl`, `_parked/`, `base/` and `.audit-patterns.txt`. That last one is the
confidentiality blocklist: committing it publishes the exact list it exists to protect. Keep a copy
outside the repo, because `node audit.mjs` fails loudly without it rather than passing silently.

### Step 3, Cloudflare Pages (10 minutes)

Create a Pages project connected to that repo.

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |
| Root directory | *(leave empty, the repo root is already `site/`)* |

`functions/` is picked up automatically. No config file is needed.

### Step 4, the bindings

Create one KV namespace and bind it as **`DEMO_KV`**. Then set these on the Pages project:

| Name | Kind | Value | Needed for |
|---|---|---|---|
| `DEMO_KV` | KV binding | the namespace | Counters, budget, CV requests |
| `DEMO_SECRET` | Secret | any long random string | Signing session tokens |
| `OPENAI_API_KEY` | Secret | your personal key | Novel questions only |
| `DEMO_MODEL` | Variable | `gpt-5-nano` | Which model those reach |
| `TURNSTILE_SECRET` | Secret | from step 6 | Splitting the verified budget pool |
| `RESEND_API_KEY` | Secret | optional | Emailing you CV requests |
| `CV_NOTIFY_TO` | Variable | optional | Where those emails go |
| `CV_NOTIFY_FROM` | Variable | optional | A verified sender on the domain |

Generate the secret with `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.

**Nothing here is required for the site to work.** With no bindings at all, every answer comes from
the reviewed cache or the prepared refusal, and the CV form still returns cleanly. The bindings buy
novel answers, durable counters and email, not availability.

### Step 5, the domain on the project

Attach `vanshajkakkar.com` in the Pages project's Custom domains tab. Pick apex or `www` once and
redirect the other permanently, so a link you hand out never splits.

### Step 6, the free security layer

- **Turnstile**: create a widget, put the secret in `TURNSTILE_SECRET`. Without it, everyone shares
  the smaller unverified budget pool, which still works, just meaner.
- **WAF**: turn on the free managed ruleset and add a rate-limiting rule on `/api/*`.
- **Web Analytics**: on. No cookie banner needed, because it sets no cookie.

### Step 7, before every publish

```
node audit.mjs
```

Link integrity, the confidentiality blocklist, no em dashes, crawlability, per-page basics. It
covers `public/` and `data/answers.json`, which is the other body of text a visitor sees. **PASS is
the gate.** Do not push on a FAIL.

**Done and verified:**

- The site, the design system, the work and education sections.
- The agent, its cache, its ranking, its guardrails and its refusal path.
- The Node server, the Docker setup, and the Pages Function twins of both endpoints.
- Telemetry stripped from every browser response on both the Node and edge paths.
- The confidentiality gate, extended to cover the answer data.

**Not done, and needs you:**

- The illustrated avatar card has technique chips rather than real technology, because there is no
  evidence for its stack anywhere in the corpus.
- Whether client names ever go public. They are anonymised to sector everywhere right now.

---

## 4. The model, and the cost

You said you will use your own OpenAI key, so the demo is built for OpenAI.

**Cheapest current OpenAI text model: `gpt-5-nano`, at $0.05 per 1M input tokens and $0.40 per 1M
output tokens**, with cached input at $0.005. For comparison, `gpt-4.1-nano` is $0.10/$0.40 and
`gpt-4o-mini` is $0.15/$0.60.

That is meaningfully cheaper than Claude Haiku 4.5 at $1.00/$5.00, roughly seventeen times cheaper
per session on the usage shape in `research/05-demo-spec.md`.

**But the cost difference barely matters here, and this is worth understanding before optimising it.**
Most questions never reach the model at all. They are answered from a hand-reviewed cache, free and
instantly. Cost scales with novelty, not with traffic. On the spec's own assumptions:

| | Per 1,000 novel questions | Per month at the daily cap |
|---|---|---|
| `gpt-5-nano` | about $1.10 | well under $1 |
| Claude Haiku 4.5 | about $18 | about $11 |

So the real decision is not price, it is **what the cost panel says on the page**, because the panel
names the model. Running `gpt-5-nano` is honest and cheap. If the site's positioning leans on the
Claude and Bedrock work, a reviewer may notice the mismatch. Either is defensible. `gpt-5-nano` is
configured, and switching is one environment variable.

---

## 5. What is real locally and what is not

Be honest about this, because it matters for the security claims.

**Real on localhost and in Docker:** the answer cache, input length cap, turn cap, session length cap,
signed session tokens that a client cannot forge, per-IP soft limits, split verified and unverified
pools, the budget kill switch, output token caps, graceful degradation, and the refusal path.

**Edge-only, and therefore stubbed until deployed:** Turnstile verification, the WAF, bot score, and
`CF-Connecting-IP`. Those exist only in front of a real Cloudflare deployment. The code reads the
header and falls back to the socket address locally, which is correct behaviour but is not the same
protection.

The governing rule holds in both environments: **an attacker gets limited, a visitor never sees a
limit, and the site itself cannot go down**, because the pages are static files and the demo is an
island on them.
