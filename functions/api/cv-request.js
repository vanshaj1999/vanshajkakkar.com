/*
   POST /api/cv-request, the edge twin of handleCvRequest in server.mjs.

   The CV is never a public link. A request lands here, gets stored, and Vanshaj
   decides who receives the file. Nothing is sent automatically.

   Bindings on the Pages project:
     DEMO_KV          KV namespace, shared with ask.js. Optional but strongly wanted:
                      without it a request is only visible in the Cloudflare log tail.
     RESEND_API_KEY   secret, optional. Absent, requests are stored and not emailed.
     CV_NOTIFY_TO     plain var, the address to notify. Defaults to the personal one.
     CV_NOTIFY_FROM   plain var, a verified sender on the domain.

   The visitor sees the same reply either way. A notification that fails to send is
   an operator problem, never theirs, so it can never turn into an error on the page.
*/

const MAX_BODY = 8192;
const NOTIFY_PER_IP_DAILY = 5;   // past this, still recorded, just not emailed

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const day = () => new Date().toISOString().slice(0, 10);
const json = (obj, code = 200) =>
  new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  // Set by Cloudflare and unforgeable. X-Forwarded-For is client supplied, so never it.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const kv = env.DEMO_KV;

  let stored = false;

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, reason: 'invalid' });

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, reason: 'invalid' }); }

  const record = {
    at: new Date().toISOString(),
    name: clean(body.name, 80),
    email: clean(body.email, 120),
    company: clean(body.company, 80),
    role: clean(body.role, 80),
    note: clean(body.note, 400),
    ip,
  };

  if (!record.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) {
    return json({ ok: false, reason: 'invalid' });
  }

  // Rate limit silently. Over the cap the visitor still gets ok:true, because telling
  // a scripted submitter it hit a limit is telling it what to change.
  /* The cap suppresses the notification, it does not discard the request.

     It used to return early and drop everything, which is wrong twice over. A genuine
     burst, a recruiter and two colleagues behind one office connection, would lose real
     requests silently. And it hid a working system from the only person who could not be
     rate limited out of caring about it: testing past the cap made the whole notification
     path look broken when nothing was.

     Storage is free. Nothing is ever thrown away. Only the email is held back, because
     the email is the part someone could weaponise into a flood of your inbox. */
  let quiet = false;
  if (kv) {
    const key = `cv:${day()}:${ip}`;
    const n = Number(await kv.get(key) || 0) + 1;
    await kv.put(key, String(n), { expirationTtl: 60 * 60 * 26 });
    quiet = n > NOTIFY_PER_IP_DAILY;
    if (quiet) console.warn(`cv-request ${n} from this address today, recorded but not emailed`);

    stored = await kvPut(kv, `cvreq:${record.at}:${crypto.randomUUID().slice(0, 8)}`,
      quiet ? { ...record, rateLimited: true } : record);
  }

  const emailed = quiet ? false : await notify(env, record);

  /* The important line in this file.

     With no KV binding and no mail key, an earlier version of this returned ok:true and
     dropped the request on the floor. The visitor was thanked, and nothing ever reached
     anyone. A form that silently discards what someone typed is worse than a form that is
     honestly broken, because the person believes they have been heard.

     So success is only claimed when the request actually landed somewhere durable. If it
     did not, the form says so and points them at the email address, which always works. */
  console.log(`cv-request from ${record.email}: stored=${stored} emailed=${emailed}`);

  if (!stored && !emailed) {
    console.error('cv-request dropped: nowhere to put it and nobody to tell');
    return json({ ok: false, reason: 'unavailable' });
  }
  return json({ ok: true });
}

async function kvPut(kv, key, record) {
  try {
    await kv.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 });
    return true;
  } catch { return false; }
}

/* Returns whether the notification actually went out, because the caller uses that to
   decide whether it can honestly thank the visitor.

   Every branch logs. A notification that quietly fails is the exact bug this endpoint
   already had once, and "it returned ok so it must have worked" is how it survived. The
   logs name which step failed, and never contain the key or the visitor's message. */
async function notify(env, r) {
  if (!env.RESEND_API_KEY) {
    console.error('notify skipped: RESEND_API_KEY is not set on this Worker');
    return false;
  }
  // Resend matches the recipient against the account address case-sensitively while it
  // is on the test sender, so a capitalised address 403s with a message about domains
  // that sends you looking in entirely the wrong place. Lowercase it here.
  const to = (env.CV_NOTIFY_TO || 'vanshaj.kakkar@gmail.com').toLowerCase();
  const from = env.CV_NOTIFY_FROM || 'site@vanshajkakkar.com';
  const line = (k, v) => (v ? `${k}: ${v}\n` : '');
  const text =
    `${r.name} asked for your CV.\n\n` +
    line('Email', r.email) + line('Company', r.company) + line('Role', r.role) +
    line('Note', r.note) +
    `\nReceived ${r.at}\n\nNothing has been sent. Reply to them yourself if you want them to have it.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from, to, subject: `CV request from ${r.name}`, text,
        reply_to: r.email,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`notify failed: resend returned ${res.status} ${detail.slice(0, 300)}`);
      return false;
    }
    console.log(`notify sent to ${to} from ${from}`);
    return true;
  } catch (e) {
    // The visitor is never held responsible for a mail provider, but the operator should
    // be able to see that it happened.
    console.error('notify threw:', e && e.message ? e.message : String(e));
    return false;
  }
}

// Only onRequestPost is exported on purpose. Pages answers any other method with a 405
// of its own; exporting onRequest as well would take over every method and undo that.
