import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from PIL import Image

app = FastAPI(
    title="CLIP Embedding Service",
    description="Encodes text and images into the same 512d vector space via CLIP",
    version="0.1.0",
)

model = SentenceTransformer("clip-ViT-B-32")
IMAGES_DIR = os.getenv("IMAGES_DIR", "/images")


class TextRequest(BaseModel):
    text: str


class ImageRequest(BaseModel):
    filename: str  # relative to IMAGES_DIR


@app.get("/health")
def health():
    return {"status": "healthy", "service": "clip-embedding-service"}


@app.post("/embed-text")
def embed_text(request: TextRequest):
    vector = model.encode(request.text).tolist()
    return {"vector": vector, "dimension": len(vector)}


@app.post("/embed-image")
def embed_image(request: ImageRequest):
    path = os.path.join(IMAGES_DIR, request.filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Image not found: {request.filename}")
    image = Image.open(path).convert("RGB")
    vector = model.encode(image).tolist()
    return {"vector": vector, "dimension": len(vector)}
