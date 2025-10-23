# Use the official Bun image
FROM oven/bun:1.3-alpine

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb for dependency installation
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Create a non-root user for security
RUN addgroup --system --gid 1001 bun && \
    adduser --system --uid 1001 --gid 1001 bun

# Change ownership of the app directory to the bun user
RUN chown -R bun:bun /app

# Switch to non-root user
USER bun

# Expose port 3000
EXPOSE 3000

# Health check to verify the API is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Run the application
CMD ["bun", "run", "src/index.ts"]
