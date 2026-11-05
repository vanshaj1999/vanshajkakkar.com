# There are no dependencies, so there is nothing to install and no build stage to
# separate. A single layer over the runtime image is the whole thing.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Only what the server actually reads at runtime. No dotfiles, no .env, no docs.
COPY --chown=node:node server.mjs ./
COPY --chown=node:node data ./data
COPY --chown=node:node public ./public

USER node
EXPOSE 4321

# The index page, not the demo endpoint. Layer 0 of the spec: the site being up
# has no dependency on the demo being up, and the health check says the same.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
