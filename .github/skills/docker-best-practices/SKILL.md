---
name: "Docker Best Practices"
description: "Containerization best practices for Node.js/React. Use when: creating Dockerfiles, optimizing images, or managing containers."
---

# Docker Best Practices

Containerization guidelines for Node.js applications.

## Multi-stage Build

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

## Best Practices

- Use Alpine for smaller images
- Multi-stage builds for separation
- Don't run as root
- Use `.dockerignore`
- Pin base image versions
- Scan for vulnerabilities

## For Mansoni

Project uses: Vite dev server (port 8080), mediasoup SFU, Node services