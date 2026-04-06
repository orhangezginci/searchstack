import asyncio
import json
import os
import re
import numpy as np
import httpx
import redis as redis_lib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

app = FastAPI(title="API Gateway", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(httpx.ConnectError)
async def connect_error_handler(request: Request, exc: httpx.ConnectError):
    return JSONResponse(status_code=503, content={"detail": "A downstream service is unavailable. Please try again shortly."})

EMBEDDING_SERVICE = os.getenv("EMBEDDING_SERVICE_URL", "http://embedding-service:8001")
VECTOR_SEARCH_SERVICE = os.getenv("VECTOR_SEARCH_SERVICE_URL", "http://vector-search-service:8002")
KEYWORD_SEARCH_SERVICE = os.getenv("KEYWORD_SEARCH_SERVICE_URL", "http://keyword-search-service:8003")
CLIP_EMBEDDING_SERVICE = os.getenv("CLIP_EMBEDDING_SERVICE_URL", "http://clip-embedding-service:8005")


REDIS_HOST = os.getenv("REDIS_HOST", "redis")
cache = redis_lib.Redis(host=REDIS_HOST, decode_responses=True)

CACHE_KEY_IMAGE_VECTORS = "clip:image_vectors"
CACHE_PREFIX_CONCEPT    = "clip:concept:"


async def load_image_vectors():
    """Fetch all raw image vectors from Qdrant and store in Redis (once)."""
    if cache.exists(CACHE_KEY_IMAGE_VECTORS):
        print("[cache] image vectors already cached", flush=True)
        return
    print("[cache] loading image vectors into Redis...", flush=True)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{VECTOR_SEARCH_SERVICE}/vectors",
            json={"collection": "images"},
        )
    if resp.status_code != 200:
        print("[cache] failed to load image vectors", flush=True)
        return
    vectors = resp.json()  # {filename: [float, ...]}
    cache.set(CACHE_KEY_IMAGE_VECTORS, json.dumps(vectors))
    print(f"[cache] cached {len(vectors)} image vectors", flush=True)


@app.on_event("startup")
async def startup():
    await load_image_vectors()


class SearchRequest(BaseModel):
    query: str
    collection: str = "recipes"
    limit: int = 5
    score_threshold: float = 0.20


class PositionsRequest(BaseModel):
    query: str | None = None
    collection: str = "recipes"


IMAGES_DIR = os.getenv("IMAGES_DIR", "/images")

@app.get("/health")
def health():
    return {"status": "ok", "service": "api-gateway"}

@app.get("/images/{filename}")
def serve_image(filename: str):
    path = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.post("/search")
async def search(request: SearchRequest):
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: get embedding for the query
        embed_response = await client.post(
            f"{EMBEDDING_SERVICE}/embed",
            json={"text": request.query},
        )
        if embed_response.status_code != 200:
            raise HTTPException(status_code=502, detail="Embedding service error")
        vector = embed_response.json()["vector"]

        # Step 2: call both search services in parallel
        semantic_task = client.post(
            f"{VECTOR_SEARCH_SERVICE}/search",
            json={"collection": request.collection, "vector": vector, "limit": request.limit, "score_threshold": request.score_threshold},
        )
        keyword_task = client.post(
            f"{KEYWORD_SEARCH_SERVICE}/search",
            json={"index": request.collection, "query": request.query, "limit": request.limit},
        )
        semantic_response, keyword_response = await asyncio.gather(semantic_task, keyword_task)

    semantic_results = semantic_response.json().get("results", []) if semantic_response.status_code == 200 else []
    keyword_results = keyword_response.json().get("results", []) if keyword_response.status_code == 200 else []

    return {
        "query": request.query,
        "semantic": semantic_results,
        "keyword": keyword_results,
    }


@app.post("/positions")
async def positions(request: PositionsRequest):
    async with httpx.AsyncClient(timeout=30.0) as client:
        query_vector = None

        if request.query:
            embed_response = await client.post(
                f"{EMBEDDING_SERVICE}/embed",
                json={"text": request.query},
            )
            if embed_response.status_code != 200:
                raise HTTPException(status_code=502, detail="Embedding service error")
            query_vector = embed_response.json()["vector"]

        positions_response = await client.post(
            f"{VECTOR_SEARCH_SERVICE}/positions",
            json={"collection": request.collection, "query_vector": query_vector},
        )

    if positions_response.status_code != 200:
        raise HTTPException(status_code=502, detail="Vector search service error")

    return positions_response.json()


class ImageSearchRequest(BaseModel):
    query: str
    limit: int = 5


@app.post("/search/images")
async def search_images(request: ImageSearchRequest):
    async with httpx.AsyncClient(timeout=30.0) as client:
        embed_response = await client.post(
            f"{CLIP_EMBEDDING_SERVICE}/embed-text",
            json={"text": request.query},
        )
        if embed_response.status_code != 200:
            raise HTTPException(status_code=502, detail="CLIP embedding service error")
        vector = embed_response.json()["vector"]

        # run top-N search and full-collection search in parallel
        top_response, full_response = await asyncio.gather(
            client.post(
                f"{VECTOR_SEARCH_SERVICE}/search",
                json={"collection": "images", "vector": vector, "limit": request.limit, "score_threshold": 0.15},
            ),
            client.post(
                f"{VECTOR_SEARCH_SERVICE}/search",
                json={"collection": "images", "vector": vector, "limit": 1000, "score_threshold": 0.0},
            ),
        )

    if top_response.status_code != 200:
        raise HTTPException(status_code=502, detail="Vector search service error")

    cached = cache.get(CACHE_KEY_IMAGE_VECTORS)
    total_indexed = len(json.loads(cached)) if cached else 0

    all_scores = [r["score"] for r in full_response.json().get("results", [])]
    top_score = all_scores[0] if all_scores else 1.0

    results = []
    for r in top_response.json().get("results", []):
        score = r["score"]
        scores_below = sum(1 for s in all_scores if s < score)
        percentile = round((scores_below / len(all_scores)) * 100) if all_scores else 0
        results.append({
            "filename": r["payload"]["filename"],
            "title": r["payload"]["title"],
            "score": score,
            "percentile": percentile,
            "score_delta": round(score - top_score, 4),
        })

    return {
        "query": request.query,
        "total_indexed": total_indexed,
        "results": results,
    }


@app.post("/positions/images")
async def positions_images(request: PositionsRequest):
    async with httpx.AsyncClient(timeout=30.0) as client:
        query_vector = None

        if request.query:
            embed_response = await client.post(
                f"{CLIP_EMBEDDING_SERVICE}/embed-text",
                json={"text": request.query},
            )
            if embed_response.status_code != 200:
                raise HTTPException(status_code=502, detail="CLIP embedding service error")
            query_vector = embed_response.json()["vector"]

        positions_response = await client.post(
            f"{VECTOR_SEARCH_SERVICE}/positions",
            json={"collection": "images", "query_vector": query_vector},
        )

    if positions_response.status_code != 200:
        raise HTTPException(status_code=502, detail="Vector search service error")

    return positions_response.json()


_STOPWORDS = {"a", "an", "the", "at", "in", "on", "of", "for", "to", "is", "are",
              "and", "or", "but", "with", "by", "from", "i", "my", "me", "some"}


def extract_concepts(query: str) -> list[str]:
    words = re.findall(r"[a-z]+", query.lower())
    return [w for w in words if w not in _STOPWORDS] or words


async def get_concept_vector(client: httpx.AsyncClient, concept: str) -> list[float]:
    """Return concept vector from Redis cache, or embed and cache it."""
    key = f"{CACHE_PREFIX_CONCEPT}{concept}"
    cached = cache.get(key)
    if cached:
        return json.loads(cached)
    resp = await client.post(f"{CLIP_EMBEDDING_SERVICE}/embed-text", json={"text": concept})
    resp.raise_for_status()
    vector = resp.json()["vector"]
    cache.set(key, json.dumps(vector))
    print(f"[cache] cached concept vector: '{concept}'", flush=True)
    return vector


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    return float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-10))


class ConceptsRequest(BaseModel):
    query: str
    filenames: list[str]


@app.post("/search/images/concepts")
async def image_concepts(request: ConceptsRequest):
    concepts = extract_concepts(request.query)

    async with httpx.AsyncClient(timeout=30.0) as client:
        concept_vectors = await asyncio.gather(
            *[get_concept_vector(client, c) for c in concepts]
        )

    cached_docs = cache.get(CACHE_KEY_IMAGE_VECTORS)
    image_vectors = {
        fn: json.loads(cached_docs)[fn]
        for fn in request.filenames
        if cached_docs and fn in json.loads(cached_docs)
    }

    all_vectors = json.loads(cached_docs) if cached_docs else {}
    breakdown = {}
    for filename in request.filenames:
        if filename not in all_vectors:
            continue
        img_vec = all_vectors[filename]
        breakdown[filename] = {
            concept: round(cosine_similarity(cv, img_vec), 4)
            for concept, cv in zip(concepts, concept_vectors)
        }

    return {"concepts": concepts, "breakdown": breakdown}
