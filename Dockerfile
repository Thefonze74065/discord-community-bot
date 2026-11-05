# Use Node.js 22 LTS (alpine for smaller image size)
FROM node:22-alpine

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port for dashboard
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
