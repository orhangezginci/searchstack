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
