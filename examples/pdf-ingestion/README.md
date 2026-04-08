# Example: PDF Ingestion Service

Add semantic search over your own PDFs to Search Arena in 5 steps.

For the full explanation of how and why this works, see [docs/tutorial.md](../../docs/tutorial.md).

---

## 1. Clone and start Search Arena

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

Wait until everything is healthy (~3–5 minutes on first boot).

---

## 2. Copy this example into the project

```bash
cp -r examples/pdf-ingestion services/pdf-ingestion-service
```

---

## 3. Add the service to docker-compose.yml

Open `docker-compose.yml` and add this block alongside the other services:

```yaml
  pdf-ingestion-service:
    build: ./services/pdf-ingestion-service
    ports:
      - "8006:8006"
    depends_on:
      rabbitmq:
        condition: service_healthy
    environment:
      - PYTHONUNBUFFERED=1
      - RABBITMQ_HOST=rabbitmq
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8006/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
```

---

## 4. Start the service

```bash
docker compose up -d --build pdf-ingestion-service
```

Verify it's running:

```bash
curl http://localhost:8006/health
# {"status":"ok","service":"pdf-ingestion-service"}
```

---

## 5. Ingest your PDFs

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@your_document.pdf" \
  -F "collection=docs"
```

Repeat for as many files as you like.

---

## Search

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question", "collection": "docs", "limit": 5}' \
  | python3 -m json.tool
```
