# Example: PDF Ingestion Service

This is the final result of [docs/tutorial.md](../../docs/tutorial.md).

Copy this directory into your Search Arena clone as `services/pdf-ingestion-service/`, add the block below to `docker-compose.yml`, and you have semantic search over your PDFs.

---

## docker-compose.yml block

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

## Ingest

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@your_document.pdf" \
  -F "collection=docs"
```

## Search

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question", "collection": "docs", "limit": 5}'
```

---

For the full step-by-step explanation of how and why this works, see [docs/tutorial.md](../../docs/tutorial.md).
