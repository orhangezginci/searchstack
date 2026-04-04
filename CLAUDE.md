# Search Arena

## HOW WE WORK — NON-NEGOTIABLE RULES
1. **ONE small step at a time.** Never batch multiple changes.
2. **STOP and WAIT** for my explicit approval after each step. If I haven't said "yes", "confirmed", "works", "done", "next" or similar — you do NOT continue.
3. **I type every change myself.** Tell me what to create/edit and where. Never auto-write files without me confirming. Learning by doing is the whole point.
4. **Bulletproof before moving on.** Each step must be tested and verified working before the next step begins.
5. **No zip files, no full project dumps.** Small, incremental, explainable changes only.
6. **When something breaks**, we debug it together step by step. Don't silently rewrite everything.

## Project Overview
A GitHub showcase project demonstrating expert knowledge in:
- Vector databases and the adapter pattern (swap Qdrant/ChromaDB/Weaviate via config)
- Semantic search vs keyword search (side-by-side comparison)
- Event-driven microservice architecture (RabbitMQ fanout)
- Multi-modal embeddings (text via sentence-transformers, images via CLIP)

## Architecture Principles
- **Event-driven via RabbitMQ**: Ingestion publishes to a fanout exchange (`ingestion.events`). Search services consume independently. Maximum decoupling.
- **Adapter pattern**: Abstract `VectorDBAdapter` interface. Qdrant is the current implementation. Swappable without touching other services.
- **REST for reads, events for writes**: Search queries are synchronous REST (user waits for results). Indexing flows through RabbitMQ (async, decoupled).

## Tech Stack
- **Backend**: Python FastAPI (all services — built-in Swagger is part of the demo)
- **Frontend**: React + TypeScript, Framer Motion, React Three Fiber
- **Vector DB**: Qdrant (behind adapter pattern)
- **Keyword Search**: Elasticsearch 8.12.0
- **Message Broker**: RabbitMQ 3-management
- **Text Embeddings**: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
- **Image Embeddings**: CLIP (to be added)

## Services
| Service | Port | Directory |
|---------|------|-----------|
| frontend | 3000 | services/frontend |
| api-gateway | 8000 | services/api-gateway |
| embedding-service | 8001 | services/embedding-service |
| vector-search-service | 8002 | services/vector-search-service |
| keyword-search-service | 8003 | services/keyword-search-service |
| ingestion-service | 8004 | services/ingestion-service |
| qdrant | 6333 | (docker image) |
| elasticsearch | 9200 | (docker image) |
| rabbitmq | 5672/15672 | (docker image) |

## Use Cases
1. **Recipe Search (Text → Text)**: "I have a hangover" → semantic finds Bloody Mary, keyword finds nothing
2. **Image Search (Text → Image)**: "romantic sunset at the beach" → CLIP finds matching photos, keyword is useless

## Key Design Decisions
- CPU-only torch in embedding-service (via `--extra-index-url https://download.pytorch.org/whl/cpu`) to avoid CUDA bloat
- `PYTHONUNBUFFERED=1` on ALL Python services (Docker stdout buffering fix)
- `uuid5` for Qdrant point IDs (Qdrant requires UUIDs, not plain strings)
- RabbitMQ consumer runs in a background thread with retry logic (10 retries, 5s apart)
- docker-compose.yml has NO `version` field (obsolete warning)

## Common Commands
```bash
docker compose up -d                          # Start everything
docker compose up -d --build <service>        # Rebuild one service
docker compose build --no-cache <service>     # Force clean rebuild
docker compose logs <service> --tail 20       # Check logs
docker compose down                           # Stop everything
```

## Dashboards
- RabbitMQ: http://localhost:15672 (guest/guest)
- Qdrant: http://localhost:6333/dashboard
- Elasticsearch: http://localhost:9200
- Each FastAPI service: http://localhost:<port>/docs (Swagger UI)