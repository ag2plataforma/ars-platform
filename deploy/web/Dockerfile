# Imagen "web": frontend Angular compilado + Caddy (HTTPS automatico + proxy a /api).
#
# Contexto de build = raiz del repo (igual que los Dockerfiles de los
# servicios; npm workspaces necesita ver todo el repo). Desde deploy/:
#   docker compose build web
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# `npm ci` dispara `prisma generate` (postinstall de packages/database); solo
# lee el schema, por eso basta un DATABASE_URL ficticio en esta etapa.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=ars_platform"
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
RUN npm ci
RUN npm run build --workspace=apps/backoffice

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/backoffice/dist/backoffice/browser /srv
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
