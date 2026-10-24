FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/

# Expose backend port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
