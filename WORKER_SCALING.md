# Banxway Workers Scaling Guide

Comprehensive guide for deploying, scaling, and monitoring Banxway background workers.

---

## Table of Contents

1. [Overview](#overview)
2. [Workers Architecture](#workers-architecture)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [Auto-Scaling Configuration](#auto-scaling-configuration)
6. [Monitoring & Metrics](#monitoring--metrics)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Banxway uses **BullMQ** for job queue management with **Redis** as the backing store. Workers are deployed as separate containers/processes that can scale independently based on queue length and system load.

### Worker Types

| Worker | Purpose | Concurrency | Min Replicas | Max Replicas |
|--------|---------|-------------|--------------|--------------|
| **Email Poller** | Poll IMAP inboxes for new emails | 5 | 1 | 5 |
| **WhatsApp Processor** | Send WhatsApp messages via Exotel | 10 | 2 | 10 |
| **Transcription Worker** | Transcribe call recordings | 3 | 1 | 3 |

---

## Workers Architecture

```
┌─────────────────┐
│   Main API      │
│   (Port 8000)   │
└────────┬────────┘
         │
         │ Enqueues jobs
         ▼
┌─────────────────┐
│   Redis Queue   │
│   (BullMQ)      │
└────────┬────────┘
         │
         │ Job distribution
         ▼
┌─────────────────────────────────────┐
│          Worker Cluster             │
├─────────────┬──────────────┬────────┤
│ Email       │ WhatsApp     │ Trans. │
│ Poller x1-5 │ Worker x2-10 │ x1-3   │
└─────────────┴──────────────┴────────┘
         │
         │ Updates status
         ▼
┌─────────────────┐
│   Supabase DB   │
└─────────────────┘
```

---

## Local Development

### Option 1: Individual Workers

Start workers individually in separate terminals:

```bash
# Terminal 1: Email Poller
npm run worker:email-poller:dev

# Terminal 2: WhatsApp Worker
npm run worker:whatsapp:dev

# Terminal 3: Transcription Worker
npm run worker:transcription:dev
```

### Option 2: All Workers (Concurrently)

Start all workers in one terminal:

```bash
# Install concurrently (if not already installed)
npm install --save-dev concurrently

# Start all workers
npm run workers:all:dev
```

### Option 3: Docker Compose

Use Docker Compose for full stack:

```bash
# From platform root
docker-compose up

# Scale specific worker
docker-compose up --scale whatsapp-worker=3

# Scale all workers
docker-compose up \
  --scale email-poller=2 \
  --scale whatsapp-worker=5 \
  --scale transcription-worker=2
```

---

## Production Deployment

### Azure Container Apps (Recommended)

**Prerequisites:**
- Azure CLI installed
- Docker installed
- Azure Container Registry created
- Azure Container Apps Environment created

**Deploy with Auto-Scaling:**

```bash
cd banxway-backend
./deploy-workers-azure.sh
```

This script will:
1. Build Docker image
2. Push to Azure Container Registry
3. Deploy 3 worker types with auto-scaling
4. Configure queue-based scaling rules

**Manual Deployment (Azure CLI):**

```bash
# Email Poller Worker
az containerapp create \
  --name banxway-email-poller \
  --resource-group banxway-platform-prod \
  --environment banxway-env \
  --image banxwayacr.azurecr.io/banxway-backend:latest \
  --command "npm" "run" "worker:email-poller" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 5 \
  --scale-rule-name queue-scale \
  --scale-rule-type azure-queue \
  --scale-rule-metadata "queueName=email-processing" "queueLength=10" \
  --env-vars \
    NODE_ENV=production \
    REDIS_URL=secretref:redis-url \
    WORKER_CONCURRENCY=5

# Repeat for other workers...
```

### Kubernetes (Alternative)

**Deploy with Helm:**

```bash
helm install banxway-workers ./helm/banxway-workers \
  --set emailPoller.replicas.min=1 \
  --set emailPoller.replicas.max=5 \
  --set whatsappWorker.replicas.min=2 \
  --set whatsappWorker.replicas.max=10
```

---

## Auto-Scaling Configuration

### Queue-Based Scaling

Workers automatically scale based on Redis queue length using **KEDA** (Kubernetes Event-Driven Autoscaling):

**Email Poller:**
- Trigger: Queue length > 10 jobs
- Scale up: Add 1 replica per 10 jobs
- Max replicas: 5
- Scale down delay: 300 seconds

**WhatsApp Worker:**
- Trigger: Queue length > 20 jobs
- Scale up: Add 1 replica per 20 jobs
- Max replicas: 10
- Scale down delay: 180 seconds

**Transcription Worker:**
- Trigger: Queue length > 5 jobs
- Scale up: Add 1 replica per 5 jobs
- Max replicas: 3
- Scale down delay: 600 seconds

### CPU/Memory-Based Scaling

Workers can also scale based on resource usage:

```yaml
# Azure Container Apps scaling rule (CPU)
--scale-rule-name cpu-scale
--scale-rule-type cpu
--scale-rule-metadata "type=Utilization" "value=70"
```

### Manual Scaling

**Docker Compose:**
```bash
docker-compose up --scale whatsapp-worker=5
```

**Azure Container Apps:**
```bash
az containerapp update \
  --name banxway-whatsapp-worker \
  --resource-group banxway-platform-prod \
  --min-replicas 3 \
  --max-replicas 15
```

**Kubernetes:**
```bash
kubectl scale deployment whatsapp-worker --replicas=5
```

---

## Monitoring & Metrics

### Worker Health Checks

Each worker exposes health metrics via BullMQ:

```bash
# Check queue status
redis-cli LLEN bull:whatsapp-processing:wait

# Check active jobs
redis-cli LLEN bull:whatsapp-processing:active

# Check failed jobs
redis-cli LLEN bull:whatsapp-processing:failed
```

### Application Insights (Azure)

Workers automatically send metrics to Application Insights:

```bash
# View worker metrics
az monitor app-insights metrics show \
  --app banxway-workers \
  --resource-group banxway-platform-prod \
  --metric "requests/count"
```

### Prometheus Metrics

Workers expose Prometheus metrics on `/metrics` endpoint:

```
# HELP bullmq_jobs_total Total number of jobs processed
# TYPE bullmq_jobs_total counter
bullmq_jobs_total{queue="whatsapp-processing",status="completed"} 1234

# HELP bullmq_jobs_active Current active jobs
# TYPE bullmq_jobs_active gauge
bullmq_jobs_active{queue="whatsapp-processing"} 5

# HELP bullmq_job_duration_seconds Job processing duration
# TYPE bullmq_job_duration_seconds histogram
bullmq_job_duration_seconds_bucket{queue="whatsapp-processing",le="0.5"} 890
```

### Logs

**Docker Compose:**
```bash
docker-compose logs -f whatsapp-worker
```

**Azure Container Apps:**
```bash
az containerapp logs show \
  --name banxway-whatsapp-worker \
  --resource-group banxway-platform-prod \
  --follow
```

**Kubernetes:**
```bash
kubectl logs -f deployment/whatsapp-worker
```

---

## Troubleshooting

### Worker Not Processing Jobs

**Check Redis connection:**
```bash
# From worker container
redis-cli -h <redis-host> ping
```

**Check queue status:**
```bash
redis-cli LLEN bull:whatsapp-processing:wait
redis-cli LLEN bull:whatsapp-processing:active
```

**Check worker logs:**
```bash
# Look for connection errors
docker-compose logs whatsapp-worker | grep ERROR
```

### Worker High Memory Usage

**Check concurrency settings:**
```bash
# Reduce WORKER_CONCURRENCY
export WHATSAPP_WORKER_CONCURRENCY=5
```

**Check memory limits:**
```bash
# Azure Container Apps
az containerapp update \
  --name banxway-whatsapp-worker \
  --resource-group banxway-platform-prod \
  --memory 2.0Gi
```

### Scaling Not Working

**Check KEDA installation (Kubernetes):**
```bash
kubectl get scaledobject
kubectl describe scaledobject whatsapp-worker-scaler
```

**Check Azure Container Apps scaling rules:**
```bash
az containerapp revision list \
  --name banxway-whatsapp-worker \
  --resource-group banxway-platform-prod
```

### Jobs Stuck in Queue

**Inspect failed jobs:**
```bash
redis-cli LRANGE bull:whatsapp-processing:failed 0 10
```

**Retry failed jobs:**
```bash
# Via BullMQ Board UI
# Or programmatically:
node -e "const Queue = require('bullmq').Queue; \
  const queue = new Queue('whatsapp-processing'); \
  queue.retryJobs({ count: 10 });"
```

### Worker Crash Loop

**Check environment variables:**
```bash
# Azure Container Apps
az containerapp show \
  --name banxway-whatsapp-worker \
  --resource-group banxway-platform-prod \
  --query properties.template.containers[0].env
```

**Check startup command:**
```bash
# Verify package.json scripts
cat package.json | jq .scripts
```

---

## Performance Tuning

### Concurrency Settings

Adjust per-worker concurrency based on job type:

```bash
# Email Poller (I/O bound)
EMAIL_WORKER_CONCURRENCY=5

# WhatsApp Worker (Network bound)
WHATSAPP_WORKER_CONCURRENCY=10

# Transcription Worker (CPU bound)
TRANSCRIPTION_WORKER_CONCURRENCY=3
```

### Queue Priorities

Prioritize critical jobs:

```typescript
// High priority WhatsApp messages
await whatsappQueue.add('SEND_MESSAGE', data, {
  priority: 1, // Higher priority (1-10, lower number = higher priority)
});

// Low priority bulk messages
await whatsappQueue.add('SEND_MESSAGE', data, {
  priority: 10,
});
```

### Rate Limiting

Prevent API throttling:

```typescript
// Exotel WhatsApp rate limit: 10 req/sec
const whatsappWorker = new Worker('whatsapp-processing', async (job) => {
  // ... processing
}, {
  limiter: {
    max: 10,
    duration: 1000, // 10 requests per second
  },
});
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | - | Environment (production/development) |
| `REDIS_URL` | Yes | - | Redis connection string |
| `WORKER_CONCURRENCY` | No | varies | Max concurrent jobs per worker |
| `EMAIL_POLL_INTERVAL` | No | 30000 | Email polling interval (ms) |
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Supabase service role key |
| `EXOTEL_SID` | Yes* | - | Exotel account SID (*WhatsApp worker) |
| `EXOTEL_TOKEN` | Yes* | - | Exotel auth token |
| `OPENAI_API_KEY` | Yes* | - | OpenAI key (*Transcription worker) |

---

## Best Practices

1. **Start with minimum replicas** and let auto-scaling handle peaks
2. **Monitor queue lengths** to adjust scaling thresholds
3. **Set appropriate timeouts** for long-running jobs
4. **Use dead letter queues** for failed jobs
5. **Implement graceful shutdown** to finish in-progress jobs
6. **Log structured data** for better debugging
7. **Use separate Redis instances** for production and staging
8. **Enable retry logic** with exponential backoff
9. **Monitor worker health** with health check endpoints
10. **Set resource limits** to prevent memory leaks

---

## Next Steps

1. **Deploy workers** using the deployment script
2. **Monitor metrics** in Azure Portal or Prometheus
3. **Adjust scaling rules** based on actual load
4. **Set up alerts** for queue length and failures
5. **Implement circuit breakers** for external API calls

---

**Last Updated**: 2026-01-26
**Maintained By**: Banxway Development Team
