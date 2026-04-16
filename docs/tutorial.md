# Tutorial: Build a PDF Ingestion Service

**What you will build:** a PDF ingestion service that feeds your documents into Search Arena.  
**What is already done:** the PDF search frontend at **http://localhost:3001** — drag-and-drop upload, a document library, a search bar, and a built-in PDF viewer that jumps to the matched page — is already running and waiting for your service.  
**What you will touch:** one new directory, one block in `docker-compose.yml`. Nothing else.  
**Prerequisites:** Docker, Docker Compose, `curl`, any PDF file.

---

## 1. Run it

```bash
git clone https://github.com/orhangezginci/search-arena.git
cd search-arena
docker compose up -d --build
```

The full stack is now running. Two URLs are relevant to this tutorial:

| URL | What it is |
|---|---|
| **http://localhost:3000** | Demo search UI (recipe dataset — shows the engines in action) |
| **http://localhost:3001** | PDF search UI — document library, inline viewer, search with semantic/keyword badges |

Open **http://localhost:3001** now. You will see an empty document library with a search bar and two buttons: **+ Add PDFs** and **Load demo data**. The UI is fully wired to the core — the only missing piece is a service that accepts your PDFs and feeds the content through the pipeline. That is what you will build.

---

## 2. See what you are working with

Switch to **http://localhost:3000** briefly and try two queries in the demo search bar:

**`I have a hangover`**  
Semantic finds Bloody Mary. Keyword finds nothing — "hangover" doesn't appear in any recipe title or description. That's the gap semantic search fills.

**`szechuan`**  
Both engines match. Keyword finds the exact token; semantic confirms it. When both agree, hybrid boosts confidence — that's the correct answer and both engines got it.

Your PDFs will get the same treatment once your ingestion service is running. The search logic is already wired — the frontend at port 3001 will behave exactly like this demo, just over your documents.

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

## 5. Build the PDF ingestion service

This is the only thing you are building. Three files, one directory.

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
fpdf2==2.7.9
```

**`services/pdf-ingestion-service/main.py`**

The file is split into two clearly marked sections:

- **Core Service** — the essential part. Health check, document listing, PDF serving, the `/ingest` endpoint that powers drag-and-drop upload, and `/reset` to wipe the knowledge base.
- **Demo Extension** — optional. Adds `/seed-demo` and `/seed-demo/status` which power the **Load demo data** button. The five demo PDFs are generated at Docker build time (no network calls at runtime). In a production service you would remove this section entirely.

```python
import copy
import json
import os
import threading
import uuid
from pathlib import Path

import fitz  # PyMuPDF
import httpx
import pika
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="PDF Ingestion Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://embedding-service:8001")
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
EXCHANGE = "ingestion.events"

PDFS_DIR = Path(os.getenv("PDFS_DIR", "/pdfs"))
PDFS_DIR.mkdir(parents=True, exist_ok=True)

_seed_lock: threading.Lock = threading.Lock()
_seed_state: dict = {"state": "idle", "items": [], "error": None}


# ── Shared helpers ─────────────────────────────────────────────────────────────

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


def process_pdf(contents: bytes, filename: str, collection: str) -> dict:
    """Extract, embed and publish a PDF; persist it to disk. Returns summary."""
    (PDFS_DIR / filename).write_bytes(contents)

    doc = fitz.open(stream=contents, filetype="pdf")
    raw_chunks = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        if not text:
            continue
        raw_chunks.append({
            "text": text,
            "title": f"{filename} — p.{page_num}",
            "source": filename,
            "page": page_num,
        })

    if not raw_chunks:
        return {"pages": len(doc), "chunks_published": 0}

    vectors = get_embeddings([c["text"] for c in raw_chunks])

    chunks = [
        {
            "collection": collection,
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{filename}-p{chunk['page']}")),
            "text": chunk["text"],
            "vector": vector,
            "metadata": {
                "title": chunk["title"],
                "source": chunk["source"],
                "page": chunk["page"],
            },
        }
        for chunk, vector in zip(raw_chunks, vectors)
    ]
    publish_chunks(chunks)

    return {"pages": len(doc), "chunks_published": len(chunks)}


# ════════════════════════════════════════════════════════════════════════════════
#  CORE SERVICE  —  required
#  These are the endpoints a real ingestion service needs.
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "service": "pdf-ingestion-service"}


@app.get("/documents")
def list_documents():
    docs = []
    for path in sorted(PDFS_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime):
        try:
            doc = fitz.open(str(path))
            pages = len(doc)
            doc.close()
        except Exception:
            pages = 0
        docs.append({
            "filename": path.name,
            "pages": pages,
            "size_bytes": path.stat().st_size,
        })
    return {"documents": docs}


@app.get("/pdfs/{filename}")
def serve_pdf(filename: str):
    path = PDFS_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(path, media_type="application/pdf")


@app.post("/ingest")
async def ingest_pdf(
    file: UploadFile = File(...),
    collection: str = Form("docs"),
):
    contents = await file.read()
    result = process_pdf(contents, file.filename, collection)
    return {
        "filename": file.filename,
        "collection": collection,
        **result,
    }


@app.delete("/reset")
def reset_knowledge_base(collection: str = "docs"):
    """Delete all indexed documents and stored PDFs for a collection."""
    errors = []

    try:
        httpx.delete(f"{QDRANT_URL}/collections/{collection}", timeout=15)
    except Exception as e:
        errors.append(f"qdrant: {e}")

    try:
        httpx.delete(f"{ELASTICSEARCH_URL}/{collection}", timeout=15)
    except Exception as e:
        errors.append(f"elasticsearch: {e}")

    for pdf in PDFS_DIR.glob("*.pdf"):
        pdf.unlink()

    with _seed_lock:
        _seed_state.update({"state": "idle", "items": [], "error": None})

    return {"status": "ok" if not errors else "partial", "errors": errors}


# ════════════════════════════════════════════════════════════════════════════════
#  DEMO EXTENSION  —  optional, not required for a real service
#  Powers the "Load demo data" button in the frontend.
#  Ingests five PDFs that are pre-generated at build time by generate_demo_pdfs.py
#  and bundled inside the Docker image. No network calls at runtime.
#  Delete this section when you extend this service for production use.
# ════════════════════════════════════════════════════════════════════════════════

DEMO_PDFS_DIR = Path("/demo-pdfs")

DEMO_DOCS = [
    {"id": "attention-is-all-you-need",
     "label": "Attention Mechanisms and Transformer Networks"},
    {"id": "first-black-hole-image",
     "label": "Black Holes and the Limits of Spacetime"},
    {"id": "dqn-atari-games",
     "label": "Learning Through Reward: Reinforcement Learning and Game Playing"},
    {"id": "covid19-epidemiology",
     "label": "How Infectious Diseases Spread: Epidemiology and Transmission Dynamics"},
    {"id": "climate-tipping-points",
     "label": "Climate Tipping Points and Feedback Loops"},
]


def _run_seed_demo():
    """Background task — ingest pre-generated demo PDFs from /demo-pdfs."""
    items = [{"id": d["id"], "label": d["label"], "state": "pending"} for d in DEMO_DOCS]

    with _seed_lock:
        _seed_state["items"] = items

    all_failed = True

    for i, demo in enumerate(DEMO_DOCS):
        filename = f"{demo['id']}.pdf"
        with _seed_lock:
            _seed_state["items"][i]["state"] = "ingesting"

        try:
            pdf_bytes = (DEMO_PDFS_DIR / filename).read_bytes()
            result = process_pdf(pdf_bytes, filename, "docs")

            with _seed_lock:
                _seed_state["items"][i].update({
                    "state": "done",
                    "filename": filename,
                    "pages": result["pages"],
                    "chunks": result["chunks_published"],
                })
            all_failed = False

        except Exception as exc:
            with _seed_lock:
                _seed_state["items"][i].update({"state": "error", "error": str(exc)})

    with _seed_lock:
        _seed_state["state"] = "error" if all_failed else "done"


@app.post("/seed-demo")
async def start_seed_demo(background_tasks: BackgroundTasks):
    with _seed_lock:
        if _seed_state["state"] == "running":
            return {"status": "already_running", **copy.deepcopy(_seed_state)}
        _seed_state.update({"state": "running", "items": [], "error": None})

    background_tasks.add_task(_run_seed_demo)
    return {"status": "started"}


@app.get("/seed-demo/status")
def get_seed_demo_status():
    with _seed_lock:
        return copy.deepcopy(_seed_state)
```

The demo PDFs are generated at build time by a separate script. Create it now:

**`services/pdf-ingestion-service/generate_demo_pdfs.py`**

```python
"""
Generates five original copyright-free PDFs and writes them to an output directory.
Run at Docker build time — no network calls, no external dependencies beyond fpdf2.
"""
import sys
from pathlib import Path
from fpdf import FPDF

OUTPUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/demo-pdfs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def make_pdf(filename: str, pages: list[tuple[str, str]]):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    for title, body in pages:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.multi_cell(0, 10, title)
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 7, body)
    pdf.output(str(OUTPUT_DIR / filename))
    print(f"Generated {filename}")


# One entry per demo document: (filename, [(page_title, page_body), ...])
DOCS = [
    ("attention-is-all-you-need.pdf", [...]),   # Transformers
    ("first-black-hole-image.pdf",    [...]),   # Black Holes
    ("dqn-atari-games.pdf",           [...]),   # Reinforcement Learning
    ("covid19-epidemiology.pdf",      [...]),   # Epidemiology
    ("climate-tipping-points.pdf",    [...]),   # Climate
]

for fname, pages in DOCS:
    make_pdf(fname, pages)
```

> The full content of `generate_demo_pdfs.py` (with the actual page text for all five documents) is in [`examples/pdf-ingestion/generate_demo_pdfs.py`](../examples/pdf-ingestion/generate_demo_pdfs.py). Copy it directly — the text is what makes semantic vs keyword contrast work well.

**`services/pdf-ingestion-service/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY generate_demo_pdfs.py .
RUN python3 generate_demo_pdfs.py /demo-pdfs
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]
```

The `generate_demo_pdfs.py` step runs once at build time and bakes the five demo PDFs into the image. No network calls happen at runtime — `Load demo data` reads them straight from disk.

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
      embedding-service:
        condition: service_healthy
    environment:
      - PYTHONUNBUFFERED=1
      - RABBITMQ_HOST=rabbitmq
      - QDRANT_URL=http://qdrant:6333
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8006/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
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

Your ingestion service is running. The frontend at port 3001 was already waiting for it — open it now and it's fully operational.

**Option A — browser UI (no curl needed)**

Open **http://localhost:3001**. Drop a PDF anywhere on the page or click **+ Add PDFs** in the header. The file uploads, gets indexed, and appears as a card in your document library. You can ingest multiple PDFs the same way — each one becomes searchable immediately.

**Option B — curl**

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

Ingest more files the same way with either option.

---

## Optional: Load demo data to see the search in action

> **This step is not required.** Your service works — you can ingest any PDF you already have. This section seeds five documents automatically so you can try the search immediately, without hunting for test files.

Open **http://localhost:3001** and click **Load demo data**. The five demo PDFs were baked into the Docker image at build time by `generate_demo_pdfs.py` — no network calls happen. Each document loads and indexes in a few seconds.

**Why these particular documents?** They cover five unrelated topics (Transformers, Black Holes, Reinforcement Learning, Epidemiology, Climate), which makes the difference between semantic and keyword search immediately obvious:

| Query | Keyword badge | Semantic badge | What it shows |
|---|---|---|---|
| `event horizon telescope` | ✓ | ✓ | exact technical name — both engines match |
| `self-attention mechanism transformer` | ✓ | ✓ | domain terminology present verbatim |
| `presymptomatic transmission` | ✓ | ✓ | medical term found literally |
| `how does a star collapse into a black hole` | ✗ | ✓ | semantic understands the concept, keyword finds nothing |
| `virus spreads before symptoms appear` | ✗ | ✓ | natural language — no exact match in any document |

Semantic wins on paraphrased queries. Keyword fires only when the exact terms appear. Both are correct — they answer different user intents.

---

## 8. Search your documents

**Option A — browser UI**

Type a query into the search bar and press Enter. Results appear as a ranked list — each card shows:
- the matched passage with the relevant text highlighted
- which page it came from
- badge labels (`semantic`, `keyword`, or both) indicating which engines found it

Click any result to open the PDF at the exact matched page in a side panel. From there you can also click **↗** to open the full PDF externally; the matched phrase is copied to your clipboard automatically so you can Ctrl+F straight to the passage.

**Option B — curl**

```bash
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question here", "collection": "docs", "limit": 5}' \
  | python3 -m json.tool
```

The response has three separate lists — `semantic`, `keyword`, and `hybrid` — so you can compare them directly. Each result includes `title` (filename + page number). Notice which engine gets it right when you paraphrase vs. use exact terms.

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
