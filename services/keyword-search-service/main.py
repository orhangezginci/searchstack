import os
import json
import time
import threading
import pika
from fastapi import FastAPI
from pydantic import BaseModel
from elasticsearch import Elasticsearch

app = FastAPI(
    title="Keyword Search Service",
    description="Traditional BM25 keyword search using Elasticsearch",
    version="0.1.0",
)

es = Elasticsearch(os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200"))

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
EXCHANGE_NAME = "ingestion.events"
QUEUE_NAME = "keyword-search-indexing"


class SearchRequest(BaseModel):
    index: str
    query: str
    limit: int = 10


def on_message(ch, method, properties, body):
    message = json.loads(body)
    index_name = message["collection"]
    doc = {"text": message["text"], **message["metadata"]}
    es.index(index=index_name, id=message["id"], document=doc)
    ch.basic_ack(delivery_tag=method.delivery_tag)
    print(f"[keyword-search] Indexed document {message['id']} into {index_name}")


def start_consumer():
    retries = 10
    while retries > 0:
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
            print("[keyword-search] Waiting for messages...")
            channel.start_consuming()
        except Exception as e:
            retries -= 1
            print(
                f"[keyword-search] RabbitMQ not ready, retrying in 5s... ({e})"
            )
            time.sleep(5)


@app.on_event("startup")
def startup():
    print("[keyword-search] Starting RabbitMQ consumer thread...")
    thread = threading.Thread(target=start_consumer, daemon=True)
    thread.start()
    print("[keyword-search] Consumer thread started")


@app.get("/health")
def health():
    return {"status": "healthy", "service": "keyword-search-service"}


@app.post("/search")
def search(request: SearchRequest):
    result = es.search(
        index=request.index,
        body={
            "query": {
                "multi_match": {
                    "query": request.query,
                    "fields": ["title^3", "text"],
                }
            },
            "size": request.limit,
        },
    )
    hits = [
        {
            "id": hit["_id"],
            "score": hit["_score"],
            "payload": hit["_source"],
        }
        for hit in result["hits"]["hits"]
    ]
    return {"results": hits}