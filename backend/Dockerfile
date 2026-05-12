# Production image: Node + LibreOffice headless (required by libreoffice-convert → `soffice`).
# Deploy on Render/Fly/AWS: set root to this folder, enable Docker, expose PORT (default 3000).

# --- compile TypeScript ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM node:20-bookworm-slim

# Headless Writer/Calc/Impress + fonts (avoids missing glyph issues in PDFs)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && soffice --version

# LibreOffice user profile / temp (avoids permission errors in minimal containers)
ENV HOME=/tmp

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/app.js"]
