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
Semantic finds Bloody Mary and Pho Bo. Keyword finds nothing — the word "hangover" doesn't appear in any recipe. That's the gap semantic search fills.

**`szechuan`**  
Keyword wins. Exact token match — surgical and fast. Semantic adds noise.

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
```

**`services/pdf-ingestion-service/main.py`**

The file is split into two clearly marked sections:

- **Core Service** — the essential part. Health check, document listing, PDF serving, and the `/ingest` endpoint that powers drag-and-drop upload in the frontend.
- **Demo Extension** — optional. Adds `/seed-demo` and `/seed-demo/status` which power the **Load demo data** button. These download five open-access research papers automatically so you have something to search right away. In a production service you would remove this section entirely.

```python
import copy
import json
import os
import threading
import time
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
EXCHANGE = "ingestion.events"

PDFS_DIR = Path(os.getenv("PDFS_DIR", "/pdfs"))
PDFS_DIR.mkdir(parents=True, exist_ok=True)


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


# ════════════════════════════════════════════════════════════════════════════════
#  DEMO EXTENSION  —  optional, not required for a real service
#  Powers the "Load demo data" button in the frontend.
#  Downloads five open-access research papers and ingests them automatically.
#  Delete this section when you extend this service for production use.
# ════════════════════════════════════════════════════════════════════════════════

DEMO_DOCS = [
    {
        "id": "attention-is-all-you-need",
        "label": "Attention Is All You Need (Vaswani et al., 2017)",
        "pdf_urls": [
            "https://arxiv.org/pdf/1706.03762v5",
            "https://arxiv.org/pdf/1706.03762",
        ],
    },
    {
        "id": "bert-language-model",
        "label": "BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)",
        "pdf_urls": [
            "https://arxiv.org/pdf/1810.04805",
        ],
    },
    {
        "id": "myocardial-infarction-review",
        "label": "Myocardial Infarction — Pathophysiology Review (PMC)",
        "pmc_query": "myocardial infarction pathophysiology treatment review",
    },
    {
        "id": "type2-diabetes-review",
        "label": "Type 2 Diabetes Mellitus — Management Review (PMC)",
        "pmc_query": "type 2 diabetes mellitus management insulin review",
    },
    {
        "id": "alzheimer-review",
        "label": "Alzheimer Disease — Neurodegeneration Review (PMC)",
        "pmc_query": "alzheimer disease neurodegeneration cognitive decline review",
    },
]

ESEARCH_URL  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EPMC_PDF_URL = "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC{id}&blobtype=pdf"

_seed_lock: threading.Lock = threading.Lock()
_seed_state: dict = {"state": "idle", "items": [], "error": None}


def _download_pdf(urls: list[str]) -> bytes | None:
    for url in urls:
        try:
            r = httpx.get(url, timeout=60, follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                return r.content
        except Exception:
            pass
    return None


def _find_pmc_pdf(query: str) -> tuple[bytes, str] | tuple[None, None]:
    """Search PMC for query, return (pdf_bytes, filename) for the first hit with a PDF."""
    try:
        r = httpx.get(
            ESEARCH_URL,
            params={
                "db": "pmc",
                "term": f"{query}[Title/Abstract] AND open access[filter]",
                "retmax": 10,
                "retmode": "json",
                "sort": "relevance",
            },
            timeout=20,
        )
        r.raise_for_status()
        ids = r.json()["esearchresult"]["idlist"]
    except Exception:
        return None, None

    for pmcid in ids[:5]:
        try:
            resp = httpx.get(
                EPMC_PDF_URL.format(id=pmcid),
                timeout=60,
                follow_redirects=True,
            )
            ct = resp.headers.get("content-type", "")
            if resp.status_code == 200 and "pdf" in ct and resp.content[:4] == b"%PDF":
                return resp.content, f"PMC{pmcid}.pdf"
        except Exception:
            pass
        time.sleep(0.5)

    return None, None


def _run_seed_demo():
    """Background task — download and ingest all demo documents."""
    items = [{"id": d["id"], "label": d["label"], "state": "pending"} for d in DEMO_DOCS]

    with _seed_lock:
        _seed_state["items"] = items

    all_failed = True

    for i, demo in enumerate(DEMO_DOCS):
        with _seed_lock:
            _seed_state["items"][i]["state"] = "downloading"

        try:
            pdf_bytes: bytes | None = None
            filename: str | None = None

            if "pdf_urls" in demo:
                pdf_bytes = _download_pdf(demo["pdf_urls"])
                if pdf_bytes:
                    filename = f"{demo['id']}.pdf"
            elif "pmc_query" in demo:
                pdf_bytes, filename = _find_pmc_pdf(demo["pmc_query"])
                if not filename:
                    filename = f"{demo['id']}.pdf"

            if not pdf_bytes:
                with _seed_lock:
                    _seed_state["items"][i].update({"state": "error", "error": "Could not download PDF"})
                continue

            with _seed_lock:
                _seed_state["items"][i]["state"] = "ingesting"

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

> **This step is not required.** Your service works — you can ingest any PDF you already have. This section seeds a handful of open-access documents automatically so you can try the search immediately, without hunting for test files.

Open **http://localhost:3001** and click **Load demo data**. The button downloads and indexes five open-access documents (two ML papers from arXiv, three medical reviews from PubMed Central) directly through your ingestion service. Progress is shown per document.

If the ingestion service is not reachable the UI will tell you clearly — there is nothing else to configure.

**Why these particular documents?** They make the difference between semantic and keyword search immediately obvious:

| Query | What keyword finds | What semantic finds |
|---|---|---|
| `heart failure emergency` | nothing | myocardial infarction paper |
| `memory loss in old people` | nothing | Alzheimer neurodegeneration review |
| `blood sugar control` | nothing | type 2 diabetes management paper |
| `self-attention mechanism` | the Transformer paper | the Transformer paper |
| `attention mechanism` | both ML papers | both ML papers |

Semantic wins on the paraphrased queries. Keyword wins (or ties) on exact terminology. Both answers are correct — they just answer different user intents.

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
