# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React/Vite frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Install deps first (Docker layer caching)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
# VITE_API_URL=/api means the frontend calls /api/... relative to its own host,
# so the single container handles both the API and the UI.
COPY frontend/ ./
RUN VITE_API_URL=/api npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production Node.js backend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Python 3 + pip for the admin data-sync scripts
RUN apk add --no-cache python3 py3-pip && \
    python3 -m pip install --break-system-packages \
        requests \
        psycopg2-binary \
        python-dotenv

WORKDIR /app/backend

# Install production Node deps
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src/ ./src/
COPY backend/scripts/ ./scripts/
COPY backend/data/ ./data/

# Copy built frontend into backend/dist so Express can serve it
COPY --from=frontend-builder /app/frontend/dist ./dist

# ── Runtime environment ──────────────────────────────────────────────────────
# Azure App Service injects these automatically; set defaults for local Docker.
ENV NODE_ENV=production
ENV PORT=8080
# Python command — py3 binary is at /usr/bin/python3 on Alpine
ENV PYTHON_CMD=python3

EXPOSE 8080

CMD ["node", "src/index.js"]
