from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from adapter import VectorDBAdapter
import uuid


class QdrantAdapter(VectorDBAdapter):

    def __init__(self, host: str, port: int):
        self.client = QdrantClient(host=host, port=port)

    def create_collection(self, name: str, dimension: int) -> None:
        collections = [c.name for c in self.client.get_collections().collections]
        if name not in collections:
            self.client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=dimension, distance=Distance.COSINE),
            )

    def insert(self, collection: str, ids: list[str], vectors: list[list[float]], payloads: list[dict]) -> None:
        points = [
            PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, i)),
                vector=v,
                payload=p,
            )
            for i, v, p in zip(ids, vectors, payloads)
        ]
        self.client.upsert(collection_name=collection, points=points)

    def search(self, collection: str, vector: list[float], limit: int = 10, score_threshold: float = 0.20) -> list[dict]:
        results = self.client.search(
            collection_name=collection,
            query_vector=vector,
            limit=limit,
            score_threshold=score_threshold,
        )
        return [
            {"id": r.id, "score": r.score, "payload": r.payload}
            for r in results
        ]