# syntax=docker/dockerfile:1

# ---------- Stage 1: build frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: build backend ----------
FROM node:20-alpine AS backend
RUN apk add --no-cache openssl
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npx prisma generate && npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Backend production deps + compiled output
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=backend /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend /app/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=backend /app/backend/dist ./dist
COPY --from=backend /app/backend/prisma ./prisma

# Built frontend served as static files by the backend
COPY --from=frontend /app/frontend/dist ./public

# Attachments live on a mounted volume
RUN mkdir -p /data/attachments
VOLUME ["/data/attachments"]

EXPOSE 8080
# Run the guarded pre-migrate cleanup, sync the schema, then start the server.
CMD ["sh", "-c", "npx prisma db execute --file prisma/pre-migrate.sql --schema prisma/schema.prisma && npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
