# syntax=docker/dockerfile:1

FROM node:24.22.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS builder
ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
COPY . .
RUN npm run build

FROM node:24.22.1-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts ./scripts
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/validate-runtime-env.mjs --production && HOSTNAME=0.0.0.0 node server.js"]
