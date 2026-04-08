# Tutorial: Add PDF Search to Search Arena

This tutorial follows the exact workflow described in the README:

```
git clone → run → add your pipeline → search your content
```

You will not touch any existing service. You will not modify any existing file except `docker-compose.yml`. By the end you will have semantic, keyword, and hybrid search running over your own PDF library — using the same API and the same infrastructure that powers the recipe demo.

**Prerequisites:** Docker, Docker Compose, `curl`, any PDF file

---

## Step 1 — Clone and run

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

Wait for everything to start (~3–5 minutes on first boot, models download automatically).

Open **http://localhost:3000** — you should see the recipe demo working. Try `I have a hangover`. Semantic finds Bloody Mary. Keyword finds nothing. That gap is what you are about to give your PDFs.

---

## Step 2 — Understand what you are extending

Open **http://localhost:15672** (RabbitMQ dashboard, guest / guest).

You will see a fanout exchange called `ingestion.events`. Every time a document is ingested, a message lands here and fans out to two consumers:
- `vector-search-service` → embeds it → stores in Qdrant
- `keyword-search-service` → indexes it → stores in Elasticsearch

You do not need to touch either of those services. You just need to **publish to that exchange**. That is the only contract.

---

## Step 3 — Create your PDF ingestion service

Inside the cloned repo, create a new directory alongside the existing services:

```bash
mkdir services/pdf-ingestion-service
```

Create three files:

**`services/pdf-ingestion-service/requirements.txt`**

```
fastapi==0.111.0
uvicorn==0.29.0
pymupdf==1.24.0
pika==1.3.2
python-multipart==0.0.9
```

**`services/pdf-ingestion-service/main.py`**

```python
import json
import os

import fitz  # PyMuPDF
import pika
from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI(title="PDF Ingestion Service", version="1.0")

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EXCHANGE = "ingestion.events"


def publish_chunks(chunks: list[dict]):
    conn = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
    ch = conn.channel()
    ch.exchange_declare(exchange=EXCHANGE, exchange_type="fanout", durable=True)
    for chunk in chunks:
        ch.basic_publish(exchange=EXCHANGE, routing_key="", body=json.dumps(chunk))
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

    chunks = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        if not text:
            continue
        chunks.append({
            "text": text,
            "title": f"{file.filename} — p.{page_num}",
            "source": file.filename,
            "page": page_num,
            "collection": collection,
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

## Step 4 — Register it in docker-compose.yml

This is the only existing file you touch. Add one service block:

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

Start it without touching anything else:

```bash
docker compose up -d --build pdf-ingestion-service
```

Confirm it is running:

```bash
curl http://localhost:8006/health
# {"status":"ok","service":"pdf-ingestion-service"}
```

---

## Step 5 — Ingest your PDFs

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@your_document.pdf" \
  -F "collection=docs"
```

Response:

```json
{
  "filename": "your_document.pdf",
  "pages": 12,
  "chunks_published": 11,
  "collection": "docs"
}
```

Check the RabbitMQ dashboard — you will see 11 messages fan out to both consumers. Check the Qdrant dashboard at **http://localhost:6333/dashboard** — a `docs` collection appears automatically. You did not configure either of these. They just work.

Ingest as many PDFs as you like. They all land in the same collection:

```bash
curl -X POST http://localhost:8006/ingest \
  -F "file=@another_document.pdf" \
  -F "collection=docs"
```

---

## Step 6 — Search your documents

Same API the recipe demo uses. Just point it at your collection:

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your question here",
    "collection": "docs",
    "limit": 5
  }' | python3 -m json.tool
```

Each result includes `title` with the filename and page number so you always know where the match came from.

Try the same query with different meanings. Notice:
- `semantic` finds the answer even when the exact words differ
- `keyword` finds exact token matches
- `hybrid` gives the best of both

---

## What just happened

You added **one new directory** and **one block in docker-compose.yml**. You did not modify a single existing service. The vector search, keyword search, embedding, and API gateway handled your PDFs exactly the same way they handle recipes — because the only contract is: *publish a JSON chunk to the RabbitMQ exchange with a `collection` field*.

That is the architecture of Search Arena. Clone it, add your pipeline, search your content.
