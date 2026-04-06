# Search Arena

**A live side-by-side comparison of semantic search vs keyword search — built to show exactly where each approach wins, loses, and why.**

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

## What This Project Demonstrates

### 1. Semantic Search vs Keyword Search — side by side
The UI runs both engines on every query simultaneously. The contrast speaks for itself: semantic search understands *meaning*, BM25 matches *tokens*.

### 2. Multi-Modal Search with CLIP
A second mode lets you search **50 photos using natural language** — no filenames, no tags, no metadata. The images are stored under opaque names (`img_001.jpg` … `img_050.jpg`). CLIP embeds your text and the images into the same 512-dimensional vision-language space and matches by cosine similarity. Keyword search returns zero results — there is nothing to tokenise.

### 3. The Adapter Pattern on Vector Databases
All vector DB operations go through an abstract `VectorDBAdapter` interface. Qdrant is the current implementation — swappable for ChromaDB, Weaviate, or Pinecone by changing a single config value, with zero changes to any other service.

```python
class VectorDBAdapter(ABC):
    def create_collection(self, name: str, dimension: int) -> None: ...
    def insert(self, collection, ids, vectors, payloads) -> None: ...
    def search(self, collection, vector, limit, score_threshold) -> list: ...
```

### 4. Event-Driven Microservice Architecture
Ingestion publishes to a **RabbitMQ fanout exchange**. Vector search and keyword search consume independently — fully decoupled. Adding a new index means adding a new consumer, not touching existing code.

```
POST /ingest
     │
     ▼
[ingestion-service] ──► [embedding-service]
     │
     ▼
[RabbitMQ fanout exchange]
     ├──► [vector-search-service]  →  Qdrant
     └──► [keyword-search-service] →  Elasticsearch
```

### 5. Redis Embedding Cache
Concept vectors computed by CLIP are cached in Redis on first use. All 50 image vectors are pre-loaded into Redis at api-gateway startup. Repeated queries hit the cache — no redundant model inference, production-realistic latency.

### 6. Per-Result Scientific Metrics
Every image result shows:
- **Cosine similarity** — the raw vector distance score
- **Collection percentile** — "top 4% of 50" — where this result sits in the full score distribution
- **Delta vs #1** — how far behind the best match

The full-collection scan runs in parallel with the top-N search so there is no added latency.

### 7. 3D Embedding Space Visualisation (Recipe Search only)
Every recipe search renders a live **PCA-reduced 3D projection** of the 768-dimensional text embedding space using React Three Fiber. Data points are heatmap-coloured by cosine similarity — cold blue for distant, pulsing neon red for the closest match. Image search uses a fundamentally different modality (512d vision-language space) and presents results as a visual grid with per-result metrics instead.

### 8. Where Small Language Models Hit Their Limit
Searching `a romantic dinner for two` returns weak results. This is intentional — `all-mpnet-base-v2` excels at paraphrase similarity but can't bridge ingredient lists to social occasion semantics. The architecture is model-agnostic; swapping is a one-line change in the embedding service.

---

## The Demos

### Recipe Search
Type `I have a hangover` into the search bar.

Semantic search returns **Bloody Mary** and **Pho Bo**. Keyword search returns **nothing** — because the word "hangover" doesn't appear anywhere in the dataset. That gap is the whole point.

### Image Search
Type `dramatic stormy ocean` into the image search bar.

CLIP finds the matching photos from a collection of 50 opaque images. Keyword search returns zero — there are no words to match against. The concept chips on each result show which parts of your query drove the match.

---

## Quick Start

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

Docker Compose handles the full startup sequence automatically:

1. Redis, RabbitMQ, Qdrant, Elasticsearch start and pass healthchecks
2. Embedding, vector-search, keyword-search, CLIP services start
3. Image downloader fetches 50 photos into a shared volume
4. Image seeder embeds and indexes all 50 images into Qdrant
5. Recipe seeder loads 20 curated recipes into the pipeline
6. API gateway and frontend start

Open **http://localhost:3000**

> First boot takes several minutes — the embedding service downloads `all-mpnet-base-v2` (~420 MB) and the CLIP service downloads `clip-ViT-B-32` (~350 MB).

---

## Try These Queries

### Recipe Search (text → text)

| Query | Semantic finds | Keyword finds |
|---|---|---|
| `I have a hangover` | Bloody Mary, Pho Bo | ✗ nothing |
| `I have the flu` | Honey Ginger Tea, Chicken Noodle Soup | ✗ nothing |
| `something cooling on a hot day` | Gazpacho, Watermelon Salad | ✗ nothing |
| `fiery heat` | Vindaloo, Kimchi Jjigae, Mapo Tofu | ✗ nothing |
| `a warming drink for cold evenings` | Mulled Wine, Hot Toddy, Chai | ✗ nothing |

### Image Search (text → image)

| Query | CLIP finds | Keyword finds |
|---|---|---|
| `romantic sunset at the beach` | beach/ocean photos | ✗ impossible |
| `something dramatic and stormy` | storm/cliff photos | ✗ impossible |
| `cozy morning coffee` | café/morning photos | ✗ impossible |
| `joy and laughter` | children/celebration photos | ✗ impossible |

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser :3000\nReact · TypeScript · Three.js"]
    Gateway["api-gateway :8000\nFastAPI"]
    Redis["Redis :6379\nEmbedding cache"]
    Embed["embedding-service :8001\nall-mpnet-base-v2 · 768d"]
    Vector["vector-search-service :8002\nQdrant adapter · PCA"]
    Keyword["keyword-search-service :8003\nElasticsearch BM25"]
    Ingest["ingestion-service :8004"]
    CLIP["clip-embedding-service :8005\nCLIP ViT-B/32 · 512d"]
    MQ["RabbitMQ\nfanout exchange"]
    Qdrant["Qdrant :6333"]
    ES["Elasticsearch :9200"]
    Downloader["image-downloader\n50 photos on first run"]
    Seeder["image-seeder\nembeds + indexes images"]

    Browser -->|REST| Gateway
    Gateway <-->|cache| Redis
    Gateway -->|embed query| Embed
    Gateway -->|embed image query| CLIP
    Gateway -->|search| Vector
    Gateway -->|search| Keyword
    Ingest -->|embed-batch| Embed
    Ingest -->|publish| MQ
    MQ -->|consume| Vector
    MQ -->|consume| Keyword
    Vector --> Qdrant
    Keyword --> ES
    Downloader -->|shared volume| Seeder
    CLIP -->|embed images| Seeder
    Seeder -->|upsert| Vector
```

## Services

| Service | Port | Stack |
|---|---|---|
| frontend | 3000 | React, TypeScript, Framer Motion, React Three Fiber |
| api-gateway | 8000 | FastAPI, Redis client |
| embedding-service | 8001 | FastAPI, sentence-transformers (`all-mpnet-base-v2`, 768d) |
| vector-search-service | 8002 | FastAPI, Qdrant, scikit-learn (PCA) |
| keyword-search-service | 8003 | FastAPI, Elasticsearch 8.12 BM25 |
| ingestion-service | 8004 | FastAPI, pika (RabbitMQ) |
| clip-embedding-service | 8005 | FastAPI, sentence-transformers (`clip-ViT-B-32`, 512d) |
| redis | 6379 | Redis 7 (embedding vector cache) |
| qdrant | 6333 | Qdrant (persisted volume) |
| elasticsearch | 9200 | Elasticsearch (persisted volume) |
| rabbitmq | 5672 / 15672 | RabbitMQ with management UI |
| image-downloader | — | Downloads 50 photos on first run, exits |
| image-seeder | — | Embeds and indexes all images, exits |

## Dashboards

| Dashboard | URL |
|---|---|
| App | http://localhost:3000 |
| RabbitMQ Management | http://localhost:15672 (guest / guest) |
| Qdrant Dashboard | http://localhost:6333/dashboard |
| Elasticsearch | http://localhost:9200 |
| Swagger (any service) | http://localhost:800X/docs |

---

## Roadmap

- [ ] **User photo upload** — drag-and-drop your own image into the search, CLIP embeds it on the fly and finds visually similar images from the collection
- [ ] **Adapter swap demo** — live UI toggle between Qdrant and ChromaDB
- [ ] **Ingestion UI** — drag-and-drop documents into the pipeline
