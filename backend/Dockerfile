# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Limit heap so the OOM killer fails fast instead of thrashing;
# SWC keeps peak RSS well under this on typical VPS builders.
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV npm_config_update_notifier=false

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV npm_config_update_notifier=false

# Create non-root user before copying (avoids slow chown -R)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
COPY --from=builder --chown=nestjs:nodejs /app/package-lock.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

EXPOSE 3000

CMD ["sh", "-c", "npm run migration:run:prod && node dist/main"]
