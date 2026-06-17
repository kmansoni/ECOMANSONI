---
name: "Kubernetes Patterns"
description: "Kubernetes deployment patterns. Use when: deploying to K8s, managing pods, or configuring services."
---

# Kubernetes Patterns

Kubernetes deployment and management patterns.

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mansoni
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mansoni
  template:
    spec:
      containers:
      - name: app
        image: mansoni:latest
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet: { path: /health, port: 8080 }
```

## Key Concepts

- **Deployments** — stateless apps
- **StatefulSets** — databases, stateful apps
- **Services** — networking abstraction
- **Ingress** — external routing
- **ConfigMaps/Secrets** — configuration

## For Mansoni

Currently uses Vercel + Supabase (serverless), not K8s. Reference for future.