# Production image for a pre-built Medusa v2 server.
# The build output (.medusa/server, including the pre-built admin in public/admin)
# is committed to the repo, so we DO NOT run `medusa build` here — we only install
# the server's runtime dependencies once and start it. This avoids the heavy admin
# (Vite) build and the duplicate dependency install that exhausted Railway's
# free-tier build budget.

FROM node:22-slim

# Run everything from inside the pre-built server output
WORKDIR /app/.medusa/server

# Install ONLY production dependencies, exactly once, using the committed lockfile
COPY .medusa/server/package.json .medusa/server/package-lock.json ./
# --loglevel=http makes progress visible in Railway build logs (the previous
# failure stalled for 20 min with zero output). --no-audit/--no-fund drop extra
# registry round-trips; fetch timeouts make a stalled connection fail fast and
# retry instead of hanging until Railway kills the build.
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=http \
      --fetch-retries=5 --fetch-retry-mintimeout=2000 \
      --fetch-retry-maxtimeout=30000 --fetch-timeout=120000 \
    && npm cache clean --force

# Copy the pre-built server (compiled medusa-config.js, compiled src, public/admin)
COPY .medusa/server/ ./

ENV NODE_ENV=production
EXPOSE 9000

# `npm run start` => `medusa db:migrate && medusa start`
CMD ["npm", "run", "start"]
