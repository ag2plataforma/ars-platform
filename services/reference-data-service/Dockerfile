# Multi-stage build pensado para Coolify / Oracle Cloud (ARM64 Ampere compatible)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm install
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN npm install --omit=dev
EXPOSE 3004
CMD ["node", "dist/main.js"]
