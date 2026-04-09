# Search Arena

**Not a library. Not a framework. A git clone.**

Search Arena is a ready-to-run search backend with semantic, keyword, and hybrid search — extend it by adding one ingestion service for your data. Designed for real-world use cases, not demos.

No SDK. No framework lock-in. No hidden magic.

### TL;DR
- Clone → run → you have semantic + keyword + hybrid search
- Add one ingestion service for your data
- Done

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
# open http://localhost:3000
# you're searching in ~3 minutes
```

> No library to install. No framework to learn. No glue code to write.

Most semantic search setups require stitching together embeddings, vector databases, keyword search, and APIs yourself. Search Arena gives you that entire stack already wired. You only add your data pipeline.

No schema design. No search tuning. No ranking logic. It just works.

### Who this is for
- Developers building search into their product
- Side projects that need real search without the setup
- Teams prototyping search systems fast

### Hybrid search fixes what each method gets wrong

Semantic misses precision. Keyword misses meaning. Hybrid combines both — and always picks the right answer.

![Recipe search — semantic vs keyword vs hybrid](docs/demo-recipe-search.gif)

### Search images by meaning — no tags, no filenames

Type natural language. CLIP matches by visual semantics, not metadata.

![Image search — CLIP natural language over 50 photos](docs/demo-image-search.gif)

![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=flat-square&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-latest-dc244c?style=flat-square)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.12-005571?style=flat-square&logo=elasticsearch&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-ff6600?style=flat-square&logo=rabbitmq&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?style=flat-square&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=flat-square&logo=docker&logoColor=white)

---

## Mental Model

Search Arena works through one simple idea:

> You publish documents → everything else happens automatically

Think of it as a search engine you plug your data into.

```
Search Arena = Core  +  Your Pipeline

Core (runs out of the box):
  Embeddings       → converts any text to vectors
  Vector Store     → Qdrant, cosine similarity search
  Keyword Engine   → Elasticsearch BM25
  Hybrid Ranking   → Reciprocal Rank Fusion across both
  API Gateway      → single /search endpoint for everything
  Search UI        → side-by-side live comparison

Your Pipeline (one new service):
  Ingestion        → read your content → chunk it → publish to event bus
                     the core handles everything from there
```

Every ingestion service, no matter what it processes, emits messages in this format:

```json
{ "text": "...", "title": "...", "collection": "your-name" }
```

That's it. Add any extra fields — they're stored and returned automatically.

---

## What you can build

| Outcome | What to add |
|---|---|
| Search across thousands of PDFs | one PDF ingestion service |
| Search your emails like ChatGPT | connect an IMAP ingestion service |
| Search your calendar and meetings | ingest iCal / Google Calendar exports |
| Search your knowledge base | ingest markdown, Notion exports, wikis |
| Search images by natural language | already built in — CLIP text → image |

Every use case follows the same pattern: **one new service, one block in docker-compose.yml**.

---

## Included demos

The default setup ships with three reference implementations of the pattern. These are not toy examples — they are the same architecture you will use for your own data.

### Recipe search
Semantic vs keyword vs hybrid, side by side. Type `I have a hangover`: semantic finds Bloody Mary, keyword finds nothing. Type `street food quick and spicy`: semantic picks Vindaloo, keyword picks Noodle Soup, hybrid correctly promotes Pad Thai — the one result both engines agreed on.

### Image search
CLIP-based natural language retrieval over 50 photos with no filenames or tags. Type `dramatic stormy ocean`. Keyword returns zero — there is nothing to tokenise. CLIP finds the right photos by meaning.

### Upload pipeline
Drag and drop your own image. Watch the real-time ingestion pipeline embed it via CLIP, search the collection, and explain the match through visual concept probes.

**Replace these pipelines with your own. The core does not change.**

---

## Run it

Already cloned? Start everything:

```bash
docker compose up -d --build
```

Open **http://localhost:3000** — you now have a fully working search system.

> First boot takes a few minutes — embedding models download automatically (~770 MB total). Subsequent restarts are instant.

👉 Full tutorial: [build your first ingestion pipeline in ~10 minutes](docs/tutorial.md)

Try these queries to see the three engines compared live:

| Query | Semantic | Keyword | Hybrid |
|---|---|---|---|
| `I have a hangover` | Bloody Mary, Pho Bo | ✗ nothing | — |
| `street food quick and spicy` | Vindaloo | Noodle Soup | ✓ **Pad Thai** |
| `szechuan` | noisy | ✓ exact match | keyword wins |

`street food quick and spicy` is the clearest benchmark: neither engine gets it right alone. Hybrid promotes Pad Thai — the one result both engines independently ranked — and that's the correct answer.

---

## Extend it

### Where to plug in

| What you want | Where to add it |
|---|---|
| New content type (PDFs, emails…) | `services/your-ingestion-service/` |
| New search collection | `collection` param on `/search` — nothing to configure |
| Different embedding model | `services/embedding-service/main.py` — one line |
| Different vector database | `services/vector-search-service/adapter.py` — swap implementation |
| Generic ingest + search UI | already included at **http://localhost:3001** — add one entry to `COLLECTIONS` in `services/generic-frontend/src/App.tsx` |
| Custom frontend | call `POST /search` with your collection name |

### The pattern

```
1. Create services/your-ingestion-service/
   → read your content
   → chunk it
   → publish to RabbitMQ exchange "ingestion.events"

2. Add one block to docker-compose.yml

3. Done — vector search, keyword search, hybrid ranking
   all work on your content automatically
```

### Example: PDF search

Your ingestion service publishes one message per page:

```json
{ "text": "...", "title": "report.pdf — p.4", "collection": "pdfs" }
```

Search Arena automatically:
- embeds the text into a 768-dimensional vector
- indexes it in Qdrant + Elasticsearch
- makes it searchable via `POST /search` with semantic, keyword, and hybrid ranking

No additional wiring required.

👉 Full walkthrough: [docs/tutorial.md](docs/tutorial.md)

---

## Architecture

If you're curious how it works internally:

```mermaid
flowchart TD
    Browser["Browser :3000\nReact · TypeScript · Three.js"]
    GenericUI["generic-frontend :3001\nIngest + Search · any collection"]
    Gateway["api-gateway :8000\nFastAPI · Redis cache"]
    Redis["Redis :6379\nCLIP vector cache"]
    Embed["embedding-service :8001\nall-mpnet-base-v2 · 768d"]
    Vector["vector-search-service :8002\nQdrant adapter · PCA"]
    Keyword["keyword-search-service :8003\nElasticsearch BM25"]
    Ingest["ingestion-service :8004"]
    CLIP["clip-embedding-service :8005\nCLIP ViT-B/32 · 512d"]
    MQ["RabbitMQ\nfanout exchange"]
    Qdrant["Qdrant :6333"]
    ES["Elasticsearch :9200"]

    Browser -->|REST| Gateway
    GenericUI -->|REST| Gateway
    Gateway <-->|cache| Redis
    Gateway -->|embed query| Embed
    Gateway -->|embed image| CLIP
    Gateway -->|vector search| Vector
    Gateway -->|keyword search| Keyword
    Ingest -->|publish| MQ
    MQ -->|consume| Vector
    MQ -->|consume| Keyword
    Vector --> Qdrant
    Keyword --> ES
```

## Services

| Service | Port | Role |
|---|---|---|
| frontend | 3000 | Live search UI with 3D embedding space |
| generic-frontend | 3001 | Generic ingest + search UI for any collection |
| api-gateway | 8000 | Unified search API, hybrid ranking |
| embedding-service | 8001 | Text → 768d vectors (all-mpnet-base-v2) |
| vector-search-service | 8002 | Qdrant adapter, PCA projection |
| keyword-search-service | 8003 | Elasticsearch BM25 |
| ingestion-service | 8004 | Demo data ingestion via RabbitMQ |
| clip-embedding-service | 8005 | Image + text → 512d CLIP vectors |
| redis | 6379 | Embedding vector cache |
| qdrant | 6333 | Vector store (persisted) |
| elasticsearch | 9200 | Keyword index (persisted) |
| rabbitmq | 5672 / 15672 | Fanout event bus |

## Dashboards

| | URL |
|---|---|
| App | http://localhost:3000 |
| Generic UI | http://localhost:3001 |
| RabbitMQ | http://localhost:15672 (guest / guest) |
| Qdrant | http://localhost:6333/dashboard |
| Elasticsearch | http://localhost:9200 |
| API Swagger | http://localhost:8000/docs |

---

## Roadmap

- PDF ingestion pipeline out of the box
- Config-driven setup (reduce custom code to near zero)
- `create-search-arena` CLI — spin up your own search system in seconds

See [ROADMAP.md](ROADMAP.md) for the full plan.
