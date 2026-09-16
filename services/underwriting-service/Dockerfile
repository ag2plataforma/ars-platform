# Multi-stage build pensado para Coolify / Oracle Cloud (ARM64 Ampere).
#
# IMPORTANTE -- este Dockerfile NO se construye con este directorio como
# contexto: es un workspace de un monorepo npm, y depende de paquetes
# internos "@ars-platform/*" (packages/shared-common, packages/database)
# que no están publicados a npm -- `npm ci` necesita ver TODO el repo para
# poder resolverlos. En Coolify:
#   - Base Directory (contexto de build): / (raíz del repo)
#   - Dockerfile Location: services/underwriting-service/Dockerfile
# Con Docker CLI a mano, se construye así desde la raíz del repo:
#   docker build -f services/underwriting-service/Dockerfile -t underwriting-service .
FROM node:20-alpine AS build
WORKDIR /app
# `prisma generate` (parte de `npm run build:libs`, vía packages/database)
# exige que DATABASE_URL exista como variable de entorno -- no abre
# conexión real, solo lee prisma/schema.prisma -- por eso alcanza con un
# valor ficticio acá, que además solo aplica a esta etapa de build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=ars_platform"
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci
RUN npm run build:libs
RUN npm run build --workspace=services/underwriting-service
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/underwriting-service ./services/underwriting-service
EXPOSE 3005
CMD ["node", "services/underwriting-service/dist/main.js"]
