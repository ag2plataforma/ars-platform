# Multi-stage build pensado para Coolify / Oracle Cloud (ARM64 Ampere).
#
# IMPORTANTE -- este Dockerfile NO se construye con este directorio como
# contexto: es un workspace de un monorepo npm, y depende de paquetes
# internos "@ars-platform/*" (packages/shared-common, packages/database)
# que no están publicados a npm -- `npm ci` necesita ver TODO el repo para
# poder resolverlos. En Coolify:
#   - Base Directory (contexto de build): / (raíz del repo)
#   - Dockerfile Location: services/documents-service/Dockerfile
# Con Docker CLI a mano, se construye así desde la raíz del repo:
#   docker build -f services/documents-service/Dockerfile -t documents-service .
#
# A diferencia del resto de los servicios, este SÍ necesita LibreOffice
# instalado en la imagen (igual que `ag2-printer-api`, v1, en Python) --
# es lo que convierte el .docx ya mergeado a PDF (`soffice --headless
# --convert-to pdf`, ver `src/rendering/docx-to-pdf.ts`). Por eso el
# `apt-get install` de este Dockerfile es más pesado que el de los demás
# servicios (openssl únicamente) -- decisión explícita del usuario
# (2026-10-01): preferir mantener la experiencia de plantilla editable en
# Word (como v1) antes que una alternativa más liviana sin navegador/
# LibreOffice (pdfmake), aun a costa de una imagen más pesada.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=ars_platform"
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci
RUN npm run build:libs
RUN npm run build --workspace=services/documents-service
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
# openssl (Prisma) + libreoffice (conversión docx -> pdf, ver doc-comment
# arriba). `--no-install-recommends` para no arrastrar todo el paquete
# ofimático completo (ayuda-online, clipart, etc.) en una imagen que
# corre en el Oracle Free Tier.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl libreoffice-writer && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/documents-service ./services/documents-service
EXPOSE 3009
CMD ["node", "services/documents-service/dist/main.js"]
