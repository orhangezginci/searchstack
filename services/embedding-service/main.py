from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(
    title="Embedding Service",
    description="Transforms text into vector embeddings",
    version="0.1.0",
)

model = SentenceTransformer("all-mpnet-base-v2")


class TextRequest(BaseModel):
    text: str


class TextsRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health():
    return {"status": "healthy", "service": "embedding-service"}


@app.post("/embed")
def embed_text(request: TextRequest):
    vector = model.encode(request.text).tolist()
    return {"vector": vector, "dimension": len(vector)}


@app.post("/embed-batch")
def embed_batch(request: TextsRequest):
    vectors = model.encode(request.texts).tolist()
    return {"vectors": vectors, "dimension": len(vectors[0])}