# Tutorial: Build a PDF Search System

**What you will build:** semantic, keyword, and hybrid search over your own PDF library.  
**What you will touch:** one new directory, one block in `docker-compose.yml`. Nothing else.  
**Prerequisites:** Docker, Docker Compose, `curl`, any PDF file.

---

## 1. Run it

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

Open **http://localhost:3000**. The stack is running with a demo recipe dataset.

---

## 2. See what you are working with

Try two queries in the search bar:

**`I have a hangover`**  
Semantic finds Bloody Mary and Pho Bo. Keyword finds nothing — the word "hangover" doesn't appear in any recipe. That's the gap semantic search fills.

**`szechuan`**  
Keyword wins. Exact token match — surgical and fast. Semantic adds noise.

You just saw the core claim: semantic and keyword search have different strengths. Hybrid combines both. Your PDFs are about to get the same treatment.

---

## 3. Make a small change

Before adding anything new, try pointing the existing API at a collection that doesn't exist yet:

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "collection": "docs", "limit": 3}' \
  | python3 -m json.tool
```

You get back empty results — no error, no crash. The API accepts any collection name. There is nothing to register or configure in advance. That is intentional.

---

## 4. Understand the only contract

Open **http://localhost:15672** (RabbitMQ, guest / guest). You will see a fanout exchange called `ingestion.events`.

This is the only interface between your pipeline and the core. Any service that publishes a correctly formatted JSON message here gets automatic vector indexing and keyword indexing — without touching a single existing service.

The required message format:

```json
{
  "collection": "docs",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "text": "content to index",
  "vector": [0.1, 0.2, ...],
  "metadata": {
    "title": "display name",
    "source": "filename.pdf",
    "page": 1
  }
}
```

**Important:** You must call the embedding service yourself before publishing. The consumers expect `vector` to already be present — they index it directly. Use `http://embedding-service:8001/embed-batch` to get vectors for your text chunks.

Use `uuid.uuid5` for stable, reproducible IDs (Qdrant requires UUIDs). Any fields you add inside `metadata` are stored in Qdrant and returned in search results.

---

## 5. Add your PDF ingestion service

```bash
mkdir services/pdf-ingestion-service
```

**`services/pdf-ingestion-service/requirements.txt`**

```
fastapi==0.111.0
uvicorn==0.29.0
pymupdf==1.24.0
pika==1.3.2
python-multipart==0.0.9
httpx==0.27.0
```

**`services/pdf-ingestion-service/main.py`**

```python
import json
import os
import uuid

import fitz  # PyMuPDF
import httpx
import pika
from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI(title="PDF Ingestion Service", version="1.0")

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://embedding-service:8001")
EXCHANGE = "ingestion.events"


def get_embeddings(texts: list[str]) -> list[list[float]]:
    response = httpx.post(
        f"{EMBEDDING_URL}/embed-batch",
        json={"texts": texts},
        timeout=120.0,
    )
    return response.json()["vectors"]


def publish_chunks(chunks: list[dict]):
    conn = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
    ch = conn.channel()
    ch.exchange_declare(exchange=EXCHANGE, exchange_type="fanout", durable=True)
    for chunk in chunks:
        ch.basic_publish(
            exchange=EXCHANGE,
            routing_key="",
            body=json.dumps(chunk),
            properties=pika.BasicProperties(delivery_mode=2),
        )
    conn.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "pdf-ingestion-service"}


@app.post("/ingest")
async def ingest_pdf(
    file: UploadFile = File(...),
    collection: str = Form("docs"),
):
    contents = await file.read()
    doc = fitz.open(stream=contents, filetype="pdf")

    raw_chunks = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        if not text:
            continue
        raw_chunks.append({
            "text": text,
            "title": f"{file.filename} — p.{page_num}",
            "source": file.filename,
            "page": page_num,
        })

    # Get embeddings for all chunks in one batch call
    vectors = get_embeddings([c["text"] for c in raw_chunks])

    # Build full messages (text + vector) ready for the consumers
    chunks = []
    for chunk, vector in zip(raw_chunks, vectors):
        chunks.append({
            "collection": collection,
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{file.filename}-p{chunk['page']}")),
            "text": chunk["text"],
            "vector": vector,
            "metadata": {
                "title": chunk["title"],
                "source": chunk["source"],
                "page": chunk["page"],
            },
        })

    publish_chunks(chunks)

    return {
        "filename": file.filename,
        "pages": len(doc),
        "chunks_published": len(chunks),
        "collection": collection,
    }
```

**`services/pdf-ingestion-service/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]
```

---

## 6. Register it in docker-compose.yml

This is the only existing file you modify. Add one block:

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

Start it:

```bash
docker compose up -d --build pdf-ingestion-service
```

Verify:

```bash
curl http://localhost:8006/health
# {"status":"ok","service":"pdf-ingestion-service"}
```

---

## 7. Ingest your PDFs

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@your_document.pdf" \
  -F "collection=docs"
```

```json
{
  "filename": "your_document.pdf",
  "pages": 12,
  "chunks_published": 11,
  "collection": "docs"
}
```

Watch the RabbitMQ dashboard — 11 messages fan out to both consumers automatically.  
Check **http://localhost:6333/dashboard** — a `docs` collection appears. You didn't create it.

Ingest more files the same way:

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@another.pdf" \
  -F "collection=docs"
```

---

## 8. Search your documents

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question here", "collection": "docs", "limit": 5}' \
  | python3 -m json.tool
```

Each result includes `title` (filename + page number) so you always know where the match came from. Try the same question with the `semantic`, `keyword`, and `hybrid` fields in the response — notice when each one gets it right and when it doesn't.

---

## Why it worked

Now that you've done it, here's what happened under the hood:

```
Your PDF service         Core (unchanged)
─────────────────        ────────────────────────────────────────
POST /ingest
  → extract pages
  → build chunks
  → publish to ──────►  RabbitMQ fanout exchange
                              │
                              ├──► embedding-service → vector
                              │         │
                              │         ▼
                              │    vector-search-service → Qdrant
                              │
                              └──► keyword-search-service → Elasticsearch

POST /search  ◄──────────────  api-gateway (hybrid ranking)
```

You published messages. The core did the rest. This is the same path the recipe demo uses — your pipeline just produces different chunks with a different collection name.

---

## Where to go next

The same pattern works for any content type. The only thing that changes is how you read and chunk the content:

| Content type | Read with | Chunk by |
|---|---|---|
| Emails | `imaplib` | one email per chunk |
| Calendar | `icalendar` | one event per chunk |
| Web pages | `httpx` + `beautifulsoup4` | paragraphs |
| Word docs | `python-docx` | paragraphs |
| Notion export | markdown parser | sections |

In every case: read → chunk → publish to `ingestion.events` with your `collection` name. Search Arena handles the rest.

---

## Final result

The complete code from this tutorial is available in [`examples/pdf-ingestion/`](../examples/pdf-ingestion/). No explanations — just the working files, ready to copy into your project.
