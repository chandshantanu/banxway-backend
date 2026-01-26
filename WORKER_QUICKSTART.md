# Worker Deployment Quick Start

Fast-track guide to get Banxway workers running in 10 minutes.

---

## 🚀 Quick Deploy (Choose One)

### Option A: Docker Compose (Recommended for Testing)

```bash
# 1. Copy environment file
cp .env.workers.example .env.workers
# Edit .env.workers with your credentials

# 2. Start all services (from platform root)
docker-compose up -d

# 3. Verify workers are running
docker-compose ps

# 4. Check logs
docker-compose logs -f whatsapp-worker

# 5. Scale workers as needed
docker-compose up --scale whatsapp-worker=3 -d
```

**That's it!** Workers are now processing jobs.

---

### Option B: Azure Container Apps (Production)

```bash
# 1. Login to Azure
az login

# 2. Navigate to backend
cd banxway-backend

# 3. Run deployment script
./deploy-workers-azure.sh

# 4. Verify deployment
az containerapp list -g banxway-platform-prod --query "[?contains(name, 'worker')].name"

# 5. Check logs
az containerapp logs show \
  -n banxway-whatsapp-worker \
  -g banxway-platform-prod \
  --follow
```

**Done!** Auto-scaling workers are live.

---

### Option C: Local Development (No Docker)

```bash
# 1. Install dependencies
npm install
npm install -g concurrently

# 2. Build project
npm run build

# 3. Copy environment
cp .env.workers.example .env.workers
# Edit .env.workers

# 4. Start all workers
npm run workers:all:dev

# Or start individually:
npm run worker:email-poller:dev     # Terminal 1
npm run worker:whatsapp:dev         # Terminal 2
npm run worker:transcription:dev    # Terminal 3
```

**Ready!** Workers running locally.

---

## 📊 Verify Everything Works

### 1. Check Redis Connection

```bash
# Test Redis
redis-cli ping
# Should return: PONG

# Check queues
redis-cli KEYS "bull:*"
```

### 2. Send Test Job

```bash
# Via API (send WhatsApp message)
curl -X POST http://localhost:8000/api/v1/communications/messages/send-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "test-thread-id",
    "to": "+919876543210",
    "text": "Test message from workers"
  }'
```

### 3. Monitor Queue

```bash
# Check pending jobs
redis-cli LLEN bull:whatsapp-processing:wait

# Check active jobs
redis-cli LLEN bull:whatsapp-processing:active

# Check completed jobs
redis-cli LLEN bull:whatsapp-processing:completed
```

### 4. Check Worker Logs

```bash
# Docker Compose
docker-compose logs -f whatsapp-worker | grep "WhatsApp message sent"

# Azure
az containerapp logs show -n banxway-whatsapp-worker -g banxway-platform-prod

# Local
# Check terminal output
```

---

## 🔧 Common Issues & Fixes

### Workers Not Starting

**Error**: `Cannot connect to Redis`

```bash
# Fix: Check Redis is running
docker-compose ps redis

# Restart Redis
docker-compose restart redis
```

**Error**: `Missing environment variable`

```bash
# Fix: Verify .env.workers file
cat .env.workers

# Ensure all required variables are set
```

### Jobs Not Processing

**Issue**: Queue has jobs but workers idle

```bash
# Check worker logs for errors
docker-compose logs whatsapp-worker

# Restart workers
docker-compose restart whatsapp-worker
```

**Issue**: Jobs stuck in active state

```bash
# Move stuck jobs back to wait queue
redis-cli LRANGE bull:whatsapp-processing:active 0 -1
# Then manually retry via BullMQ Board
```

### High Memory Usage

```bash
# Reduce concurrency
# Edit .env.workers:
WHATSAPP_WORKER_CONCURRENCY=5  # Down from 10

# Restart workers
docker-compose restart whatsapp-worker
```

---

## 📈 Scaling Workers

### Docker Compose

```bash
# Scale specific worker
docker-compose up --scale whatsapp-worker=5 -d

# Scale all workers
docker-compose up \
  --scale email-poller=2 \
  --scale whatsapp-worker=5 \
  --scale transcription-worker=2 \
  -d

# Check running instances
docker-compose ps
```

### Azure Container Apps

```bash
# Manual scale
az containerapp update \
  -n banxway-whatsapp-worker \
  -g banxway-platform-prod \
  --min-replicas 3 \
  --max-replicas 15

# Auto-scaling is enabled by default based on queue length
# Check current replicas:
az containerapp revision list \
  -n banxway-whatsapp-worker \
  -g banxway-platform-prod \
  --query "[0].properties.replicas"
```

---

## 🎯 Next Steps

1. **Monitor Performance**
   - Set up Prometheus/Grafana dashboard
   - Configure Application Insights alerts

2. **Optimize Concurrency**
   - Adjust based on actual load
   - Monitor memory and CPU usage

3. **Set Up Alerts**
   - Queue length > threshold
   - Worker failures
   - High latency

4. **Implement Circuit Breakers**
   - For Exotel API calls
   - For OpenAI API calls

---

## 📚 Resources

- **Full Guide**: `WORKER_SCALING.md`
- **Docker Compose**: `../docker-compose.yml`
- **Azure Deployment**: `deploy-workers-azure.sh`
- **Environment Template**: `.env.workers.example`

---

## 🆘 Getting Help

**Check logs first:**
```bash
# Docker
docker-compose logs -f [worker-name]

# Azure
az containerapp logs show -n [worker-name] -g banxway-platform-prod
```

**Common log locations:**
- Container logs: `docker-compose logs`
- Application logs: `logs/` directory
- System logs: Azure Portal > Container Apps > Log stream

**Still stuck?** Check `WORKER_SCALING.md` Troubleshooting section.

---

**Deployment Status**: ✅ Ready for production
**Last Updated**: 2026-01-26
