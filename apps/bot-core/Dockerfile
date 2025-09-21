FROM node:20-alpine AS base

WORKDIR /app

# Install deps first (cache-friendly)
COPY package*.json ./
RUN npm ci --only=production

# Copy rest of code
COPY . .

CMD ["node", "index.js"]
