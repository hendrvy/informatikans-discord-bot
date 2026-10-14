# ===== Stage 1: Build (termasuk native dependency better-sqlite3) =====
FROM node:22-slim AS build

WORKDIR /app

# Dependency untuk kompilasi native module (better-sqlite3)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .


# ===== Stage 2: Runtime (image lebih kecil, tanpa build tools) =====
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app /app

# Pastikan folder data ada (untuk SQLite) saat volume belum di-mount
RUN mkdir -p /app/src/data

CMD ["node", "src/index.js"]
