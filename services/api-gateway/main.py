import asyncio
import os
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


class SearchRequest(BaseModel):
    query: str
    collection: str = "recipes"
    limit: int = 5
    score_threshold: float = 0.20


class PositionsRequest(BaseModel):
    query: str | None = None
    collection: str = "recipes"


@app.get("/health")
def health():
    return {"status": "ok", "service": "api-gateway"}


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
