import os
import json
import time
import uuid
import threading
import pika
import numpy as np
from sklearn.decomposition import PCA
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_adapter import QdrantAdapter

app = FastAPI(
    title="Vector Search Service",
    description="Semantic search using vector database (adapter pattern)",
    version="0.1.0",
)

adapter = QdrantAdapter(
    host=os.getenv("QDRANT_HOST", "qdrant"),
    port=int(os.getenv("QDRANT_PORT", "6333")),
)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EXCHANGE_NAME = "ingestion.events"
QUEUE_NAME = "vector-search-indexing"


class SearchRequest(BaseModel):
    collection: str
    vector: list[float]
    limit: int = 10
    score_threshold: float = 0.20


def on_message(ch, method, properties, body):
    message = json.loads(body)
    collection = message["collection"]
    adapter.create_collection(name=collection, dimension=len(message["vector"]))
    adapter.insert(
        collection=collection,
        ids=[message["id"]],
        vectors=[message["vector"]],
        payloads=[{"text": message["text"], **message["metadata"]}],
    )
    ch.basic_ack(delivery_tag=method.delivery_tag)
    print(f"[vector-search] Indexed document {message['id']} into {collection}")


def start_consumer():
    while True:
        try:
            connection = pika.BlockingConnection(
                pika.ConnectionParameters(host=RABBITMQ_HOST)
            )
            channel = connection.channel()
            channel.exchange_declare(
                exchange=EXCHANGE_NAME, exchange_type="fanout", durable=True
            )
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.queue_bind(exchange=EXCHANGE_NAME, queue=QUEUE_NAME)
            channel.basic_consume(
                queue=QUEUE_NAME, on_message_callback=on_message
            )
            print("[vector-search] Waiting for messages...")
            channel.start_consuming()
        except Exception as e:
            print(
                f"[vector-search] RabbitMQ connection lost, retrying in 5s... ({e})"
            )
            time.sleep(5)


@app.on_event("startup")
def startup():
    print("[vector-search] Starting RabbitMQ consumer thread...")
    thread = threading.Thread(target=start_consumer, daemon=True)
    thread.start()
    print("[vector-search] Consumer thread started")

@app.get("/health")
def health():
    return {"status": "healthy", "service": "vector-search-service"}


class UpsertDocument(BaseModel):
    id: str
    vector: list[float]
    payload: dict = {}

class UpsertRequest(BaseModel):
    collection: str
    documents: list[UpsertDocument]

@app.post("/upsert")
def upsert(request: UpsertRequest):
    if not request.documents:
        return {"status": "ok", "count": 0}
    adapter.create_collection(name=request.collection, dimension=len(request.documents[0].vector))
    adapter.insert(
        collection=request.collection,
        ids=[d.id for d in request.documents],
        vectors=[d.vector for d in request.documents],
        payloads=[d.payload for d in request.documents],
    )
    return {"status": "ok", "count": len(request.documents)}


class VectorsRequest(BaseModel):
    collection: str


@app.post("/vectors")
def get_vectors(request: VectorsRequest):
    """Return all raw vectors for a collection keyed by filename."""
    points, _ = adapter.client.scroll(
        collection_name=request.collection,
        with_vectors=True,
        with_payload=True,
        limit=1000,
    )
    return {
        p.payload["filename"]: p.vector
        for p in points
        if "filename" in p.payload
    }


@app.post("/search")
def search(request: SearchRequest):
    results = adapter.search(
        collection=request.collection,
        vector=request.vector,
        limit=request.limit,
        score_threshold=request.score_threshold,
    )
    return {"results": results}


class PositionsRequest(BaseModel):
    collection: str
    query_vector: list[float] | None = None


@app.post("/positions")
def positions(request: PositionsRequest):
    # Fetch all points with vectors from Qdrant
    points, _ = adapter.client.scroll(
        collection_name=request.collection,
        with_vectors=True,
        with_payload=True,
        limit=500,
    )
    if not points:
        raise HTTPException(status_code=404, detail="No documents found")

    ids = [str(p.id) for p in points]
    payloads = [p.payload for p in points]
    vectors = np.array([p.vector for p in points])

    # Compute cosine similarity scores for all docs if query provided
    has_query = request.query_vector is not None
    scores = []
    if has_query:
        q = np.array(request.query_vector)
        q_norm = q / (np.linalg.norm(q) + 1e-10)
        v_norms = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-10)
        scores = (v_norms @ q_norm).tolist()
        all_vectors = np.vstack([vectors, [request.query_vector]])
    else:
        all_vectors = vectors

    # Reduce to 3D with PCA
    pca = PCA(n_components=3)
    coords = pca.fit_transform(all_vectors)

    docs = [
        {
            "id": ids[i],
            "payload": payloads[i],
            "x": float(coords[i][0]),
            "y": float(coords[i][1]),
            "z": float(coords[i][2]),
            "score": float(scores[i]) if scores else None,
        }
        for i in range(len(points))
    ]

    result = {"docs": docs}
    if has_query:
        qc = coords[-1]
        result["query"] = {"x": float(qc[0]), "y": float(qc[1]), "z": float(qc[2])}

    return result


class RetrieveRequest(BaseModel):
    collection: str
    ids: list[str]  # original string IDs (e.g. filenames)


@app.post("/retrieve")
def retrieve(request: RetrieveRequest):
    point_ids = [str(uuid.uuid5(uuid.NAMESPACE_DNS, id_)) for id_ in request.ids]
    points = adapter.client.retrieve(
        collection_name=request.collection,
        ids=point_ids,
        with_vectors=True,
        with_payload=True,
    )
    # Map back from uuid → original id via payload
    result = {}
    for p in points:
        filename = p.payload.get("filename") or p.payload.get("id", str(p.id))
        result[filename] = p.vector
    return result