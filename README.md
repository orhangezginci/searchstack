# Search Arena

**A live side-by-side comparison of semantic search vs keyword search — built to show exactly where each approach wins, loses, and why.**

![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=flat-square&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-latest-dc244c?style=flat-square)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.12-005571?style=flat-square&logo=elasticsearch&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-ff6600?style=flat-square&logo=rabbitmq&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=flat-square&logo=docker&logoColor=white)

---

## The Demo

Type `I have a hangover` into the search bar.

Semantic search returns **Bloody Mary** and **Pho Bo**. Keyword search returns **nothing** — because the word "hangover" doesn't appear anywhere in the dataset.

That gap is the whole point.

The same query engine understands `I have the flu` → Honey Ginger Tea and Chicken Noodle Soup, or `a warming drink for a cold evening` → Mulled Wine, Hot Toddy, Chai Latte — without a single matching keyword in any recipe description.

---

## What This Project Demonstrates

### 1. Semantic Search vs Keyword Search — side by side
The UI runs both engines on every query simultaneously. The contrast speaks for itself: semantic search understands *meaning*, BM25 matches *tokens*.

### 2. The Adapter Pattern on Vector Databases
All vector DB operations go through an abstract `VectorDBAdapter` interface. Qdrant is the current implementation — swappable for ChromaDB, Weaviate, or Pinecone by changing a single config value, with zero changes to any other service.

```python
class VectorDBAdapter(ABC):
    def create_collection(self, name: str, dimension: int) -> None: ...
    def insert(self, collection, ids, vectors, payloads) -> None: ...
    def search(self, collection, vector, limit, score_threshold) -> list: ...
```

### 3. Event-Driven Microservice Architecture
Ingestion publishes to a **RabbitMQ fanout exchange**. The vector search service and keyword search service each consume independently — fully decoupled. Adding a new index (e.g. a graph DB) means adding a new consumer, not touching existing code.

```
POST /ingest
     │
     ▼
[ingestion-service] ──embed──► [embedding-service]
     │
     ▼
[RabbitMQ fanout: ingestion.events]
     ├──► [vector-search-service]  →  Qdrant
     └──► [keyword-search-service] →  Elasticsearch
```

### 4. 3D Embedding Space Visualisation
Every search renders a live **PCA-reduced 3D projection** of the embedding space using React Three Fiber. Data points are heatmap-coloured by cosine similarity — cold blue for distant, hot red for the closest match, which pulses. The threshold sphere shows the relevance boundary in real time.

### 5. Where Small Language Models Hit Their Limit
Searching `a romantic dinner for two` returns weak results. This is intentional and documented — `all-mpnet-base-v2` excels at paraphrase similarity but doesn't bridge the gap between ingredient lists and social occasion semantics. The same query with `text-embedding-3-large` would work. The architecture is model-agnostic; swapping is a one-line change in the embedding service.

---

## Quick Start

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

That's it. Docker Compose handles the full startup sequence:

1. RabbitMQ, Qdrant, Elasticsearch start and become healthy
2. Embedding, vector-search, keyword-search services start
3. Ingestion service connects to RabbitMQ
4. Seeder automatically loads 20 curated recipes
5. API gateway and frontend start

Open **http://localhost:3000**

> First boot takes a few minutes — the embedding service downloads `all-mpnet-base-v2` (~420 MB).

---

## Try These Queries

| Query | Semantic finds | Keyword finds |
|---|---|---|
| `I have a hangover` | Bloody Mary, Pho Bo | ✗ nothing |
| `I have the flu` | Honey Ginger Tea, Chicken Noodle Soup | ✗ nothing |
| `something cooling on a hot day` | Gazpacho, Watermelon Salad | ✗ nothing |
| `fiery heat` | Vindaloo, Kimchi Jjigae, Mapo Tofu | ✗ nothing |
| `a warming drink for cold evenings` | Mulled Wine, Hot Toddy, Chai | ✗ nothing |
| `a romantic dinner for two` | weak results | ✗ nothing — *LM limitation, see §5* |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser :3000                     │
│         React + TypeScript + React Three Fiber       │
└────────────────────┬────────────────────────────────┘
                     │ REST
┌────────────────────▼────────────────────────────────┐
│                 api-gateway :8000                    │
│                   FastAPI                            │
└──────┬─────────────────────────────┬────────────────┘
       │                             │
┌──────▼──────┐             ┌────────▼────────┐
│  embedding  │             │  keyword-search │
│  service    │             │  service :8003  │
│  :8001      │             │  Elasticsearch  │
│  all-mpnet  │             └─────────────────┘
└──────┬──────┘
       │                    ┌─────────────────┐
       │                    │  vector-search  │
       │                    │  service :8002  │
       │                    │  Qdrant adapter │
       │                    └─────────────────┘
┌──────▼──────────────────────────────────────────────┐
│              ingestion-service :8004                 │
│   embed → publish to RabbitMQ fanout exchange        │
└─────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Stack |
|---|---|---|
| frontend | 3000 | React, TypeScript, Framer Motion, React Three Fiber |
| api-gateway | 8000 | FastAPI |
| embedding-service | 8001 | FastAPI, sentence-transformers (`all-mpnet-base-v2`, 768d) |
| vector-search-service | 8002 | FastAPI, Qdrant, scikit-learn (PCA) |
| keyword-search-service | 8003 | FastAPI, Elasticsearch 8.12 BM25 |
| ingestion-service | 8004 | FastAPI, pika (RabbitMQ) |
| qdrant | 6333 | Qdrant (persisted volume) |
| elasticsearch | 9200 | Elasticsearch (persisted volume) |
| rabbitmq | 5672 / 15672 | RabbitMQ with management UI |

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

- [ ] **Image search** — CLIP multi-modal embeddings. Text query → image results. Keyword search becomes not just worse but *impossible*.
- [ ] **Adapter swap demo** — live UI toggle between Qdrant and ChromaDB
- [ ] **Ingestion UI** — drag-and-drop documents into the pipeline
