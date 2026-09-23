# Agent Canvas — control plane + static frontend
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm ci && npm run build && npm run build:api

ENV PORT=3000
EXPOSE 3000

# Serves dist/ static frontend + /api REST + /ws WebSocket.
# herdr server is auto-spawned from bin/herdr on first use.
CMD ["node", "dist-api/index.js"]
