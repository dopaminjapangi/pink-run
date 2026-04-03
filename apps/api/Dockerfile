FROM node:24-slim AS deps

WORKDIR /app

# Workspace install cache layer
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Install only API production dependencies
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false

FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api

EXPOSE 3200

CMD ["node", "apps/api/src/index.js"]
