import json
import os
import pika
import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="Ingestion Service",
    description="Accepts data, gets embeddings, publishes to RabbitMQ",
    version="0.1.0",
)

EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://embedding-service:8001")
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EXCHANGE_NAME = "ingestion.events"


def get_rabbit_connection():
    return pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))


def setup_exchange():
    connection = get_rabbit_connection()
    channel = connection.channel()
    channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="fanout", durable=True)
    connection.close()


@app.on_event("startup")
def startup():
    setup_exchange()


class Document(BaseModel):
    id: str
    text: str
    metadata: dict = {}


class IngestRequest(BaseModel):
    collection: str
    documents: list[Document]


@app.get("/health")
def health():
    return {"status": "healthy", "service": "ingestion-service"}


@app.post("/ingest")
def ingest(request: IngestRequest):
    # Step 1: Get embeddings from embedding service
    texts = [doc.text for doc in request.documents]
    response = httpx.post(f"{EMBEDDING_URL}/embed-batch", json={"texts": texts}, timeout=120.0)
    vectors = response.json()["vectors"]

    # Step 2: Publish each document + vector to RabbitMQ
    connection = get_rabbit_connection()
    channel = connection.channel()

    for doc, vector in zip(request.documents, vectors):
        message = {
            "collection": request.collection,
            "id": doc.id,
            "text": doc.text,
            "metadata": doc.metadata,
            "vector": vector,
        }
        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key="",
            body=json.dumps(message),
            properties=pika.BasicProperties(delivery_mode=2),
        )

    connection.close()

    return {
        "status": "published",
        "count": len(request.documents),
        "collection": request.collection,
    }