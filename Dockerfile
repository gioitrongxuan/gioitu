# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and build the frontend bundle ----
FROM node:22-alpine AS build
WORKDIR /app
# Build toolchain for native deps (none currently, but keeps the build robust).
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build           # tsc -b && vite build -> /app/dist

# ---- Runtime stage: backend (Express via tsx) serving API + built frontend ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only production + optional deps (express, pg, tsx); skip vite/typescript/vitest.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Backend source (run directly with tsx) + the built frontend it serves.
COPY tsconfig.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["npm", "run", "server"]
