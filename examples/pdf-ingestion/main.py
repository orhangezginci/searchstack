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
