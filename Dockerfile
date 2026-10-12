# Use official Node.js runtime as base image
FROM node:22-alpine3.20

# Set working directory
WORKDIR /usr/src/app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

# Copy package files first for better caching
COPY package*.json ./

# 지워짐 # RUN npm install
# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

RUN npm install -g env-cmd

# Copy application source code
COPY . .

# 지워짐 # RUN npm install axios
# Change ownership to non-root user
RUN chown -R nodejs:nodejs /usr/src/app

# Switch to non-root user
USER nodejs

# 🚩 컨테이너 내부는 8080 사용
EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

# 🚩 헬스체크도 8080으로
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "run", "prd"]
