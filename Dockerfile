# Use the official Bun image
FROM oven/bun:1.3-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package.json and bun.lock for dependency installation
COPY package.json bun.lock ./

# Install dependencies (including dev dependencies for TypeScript support)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Change ownership of the app directory to the bun user (bun user already exists)
RUN chown -R bun:bun /app

# Switch to non-root user (use existing bun user)
USER bun

# Expose port 3000
EXPOSE 3000

# Health check to verify the API is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Run the application
CMD ["bun", "run", "start"]
