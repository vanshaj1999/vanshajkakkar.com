/* Worker entry point.

   Static assets are matched before this runs, so by the time a request arrives here it
   is one no file in public/ answered. That is the two API routes, plus anything a
   visitor mistyped, which falls through to the site's own 404 page.

   The handlers themselves are unchanged and still live in functions/. They were written
   as Pages Functions, which take ({ request, env }) and return a Response, so they drop
   straight into a Worker with no adaptation. Keeping them there means server.mjs, the
   local Node path, and this file all run the same logic rather than three copies of it. */

import { onRequestPost as ask } from '../functions/api/ask.js';
import { onRequestPost as cvRequest } from '../functions/api/cv-request.js';

const ROUTES = {
  '/api/ask': ask,
  '/api/cv-request': cvRequest,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    /* One canonical address: https, no www.

       Two problems, one answer. Serving the same page on http and https, or on www and
       the apex, splits every link, every share and every search result across addresses
       that are not quite the same site. Plain http is also just wrong to serve at all.

       IMPORTANT LIMIT, verified against the live site: static assets are matched before
       this Worker runs, so a plain http request for "/" or "/assets/site.css" is served
       from the asset store and never reaches this code. This redirect therefore only
       covers /api/* and unknown paths. Forcing https for the whole site needs the edge
       setting "Always Use HTTPS" under SSL/TLS -> Edge Certificates, which is also the
       right layer for it: a protocol redirect should not cost a Worker invocation.

       This stays as the layer that does work, not as the whole answer.

       301 rather than 302, because it is permanent and a browser that caches it stops
       making the extra hop. Path and query survive, so a deep link still lands. */
    const canonicalHost = url.hostname.replace(/^www\./, '');
    if (url.protocol === 'http:' || url.hostname !== canonicalHost) {
      url.protocol = 'https:';
      url.hostname = canonicalHost;
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }

    const handler = ROUTES[pathname];

    if (handler) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { allow: 'POST' },
        });
      }
      try {
        return await handler({ request, env, ctx });
      } catch (err) {
        // The governing rule is that the site cannot go down. A handler that throws
        // must still leave the visitor with something true and usable, never a stack
        // trace and never a blank failure. The detail goes to the log, not the page.
        console.error(pathname, err && err.stack ? err.stack : String(err));
        return new Response(JSON.stringify({
          answer: 'I cannot reach the assistant right now. Everything it knows is on this page, and you can email Vanshaj directly.',
          source: 'error',
          ok: false,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
