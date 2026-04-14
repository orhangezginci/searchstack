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


# ── Core helpers ───────────────────────────────────────────────────────────────

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


# ── Standard endpoints ─────────────────────────────────────────────────────────

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


# ── Seed-demo ──────────────────────────────────────────────────────────────────

# Documents to seed — direct PDF downloads, no conversion needed.
# All go into the 'docs' collection so the default search finds them.
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
