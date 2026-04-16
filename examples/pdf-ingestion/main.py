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
#  Ingests five PDF documents that are pre-generated at build time
#  by generate_demo_pdfs.py and bundled inside the Docker image.
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

_seed_lock: threading.Lock = threading.Lock()
_seed_state: dict = {"state": "idle", "items": [], "error": None}


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
