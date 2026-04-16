# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including devDependencies for TypeScript)
RUN npm ci

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production
FROM node:20-slim

# Create non-root user
RUN groupadd -r authkit && useradd -r -g authkit authkit

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Change ownership to non-root user
RUN chown -R authkit:authkit /app

# Switch to non-root user
USER authkit

# Expose port (default 3000, configurable via environment)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["node", "dist/index.js"]
