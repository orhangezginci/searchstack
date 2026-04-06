import os
from pathlib import Path
import httpx

IMAGES_DIR = os.getenv("IMAGES_DIR", "/images")
CLIP_URL   = os.getenv("CLIP_URL",   "http://clip-embedding-service:8005")
VECTOR_URL = os.getenv("VECTOR_URL", "http://vector-search-service:8002")

images = sorted(Path(IMAGES_DIR).glob("*.jpg"))
if not images:
    print("No images found — run image-downloader first.", flush=True)
    exit(1)

print(f"Embedding {len(images)} images via CLIP...\n", flush=True)

documents = []
for image_path in images:
    filename = image_path.name
    title = filename.replace("-", " ").replace(".jpg", "").title()
    r = httpx.post(f"{CLIP_URL}/embed-image", json={"filename": filename}, timeout=60)
    r.raise_for_status()
    vector = r.json()["vector"]
    documents.append({"id": filename, "vector": vector, "payload": {"filename": filename, "title": title}})
    print(f"  embedded  {filename}", flush=True)

print(f"\nIndexing into Qdrant 'images' collection...", flush=True)
r = httpx.post(f"{VECTOR_URL}/upsert", json={"collection": "images", "documents": documents}, timeout=60)
r.raise_for_status()

print(f"Done. {len(documents)} images indexed.", flush=True)
