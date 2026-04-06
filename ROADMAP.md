# Search Arena — Roadmap

The long-term direction of this project is to move from a **search demo** toward a **deployable search framework** — something a developer can pull, configure, and ship as the intelligent search layer of their own product, without rebuilding the infrastructure from scratch.

---

## Current State

A fully working, containerized demo of three retrieval strategies (semantic, keyword, hybrid) plus multi-modal image search via CLIP. The architecture is already decoupled enough to serve as a foundation — but collection names, schemas, and UI modes are still hardcoded for the recipe/image demo.

---

## Phase 1 — User-Contributed Content
*Extend the demo, prove the pipeline*

- [ ] **Drag-and-drop image upload** — user drops an image, CLIP embeds it on the fly, finds visually similar images from the collection. Proves the ingestion pipeline works end-to-end for arbitrary input.
- [ ] **Adapter swap demo** — live UI toggle between Qdrant and ChromaDB. Makes the adapter pattern tangible and interactive rather than just architectural.
- [ ] **Ingestion UI** — drag-and-drop documents into the recipe pipeline. Closes the loop: ingest → index → search, all visible in the browser.

---

## Phase 2 — PDF / Document Pipeline
*First real-world use case beyond the demo*

- [ ] **PDF extraction service** — new microservice using PyMuPDF or pdfplumber. Accepts a PDF, chunks it by page or paragraph, publishes chunks to the RabbitMQ fanout exchange.
- [ ] **Schema-flexible metadata** — replace hardcoded `title/cuisine/text` fields with configurable metadata keys so any document type can be indexed without changing the search services.
- [ ] **Chunk-aware result rendering** — results show the matched excerpt and page number, not just the document title.
- [ ] **Reference implementation** — a working `docker-compose.pdf.yml` that spins up the full stack configured for document search. Pull, drop PDFs into a folder, search.

This phase proves the core claim: **add a pipeline, get intelligent search out of the box.**

---

## Phase 3 — Config-Driven Framework
*From demo to boilerplate*

- [ ] **`search-arena.yml` config** — define collections, schemas, embedding models, and thresholds in a single file. Services read config at startup rather than hardcoding values.
- [ ] **Collection bootstrapper** — on first run, reads the config and creates all Qdrant collections, Elasticsearch indices, and RabbitMQ exchanges automatically.
- [ ] **Generic frontend** — result renderer driven by config schema, not hardcoded recipe/image modes. A developer configures fields and the UI adapts.
- [ ] **Model registry** — swap embedding models (MiniLM, MPNet, BGE, OpenAI) via a single config line without rebuilding any service.

---

## Phase 4 — No-Code Setup
*Lower the floor for non-developers*

- [ ] **Setup wizard CLI** — interactive terminal wizard that asks: content type, fields to index, embedding model, threshold defaults. Outputs a ready-to-run `search-arena.yml` and `docker-compose.yml`.
- [ ] **Node-RED integration (experimental)** — visual flow editor for wiring ingestion pipelines. A node for each step: extract → chunk → embed → publish. Makes the ingestion pipeline inspectable and modifiable without code.
- [ ] **One-command cloud deploy** — a deploy script targeting Fly.io or Railway for teams that want a hosted instance without managing Docker infrastructure themselves.

---

## Positioning

The closest analogues are [Haystack](https://haystack.deepset.ai/) and [Unstructured.io](https://unstructured.io/) — both excellent but library-first: you write code to assemble the pipeline. Search Arena takes the opposite approach: **run it first, see it work, then adapt it**. The demo is not separate from the framework — it is the framework, with real data loaded in.

The target user is a developer building a product that needs intelligent search — a document management system, a knowledge base, an internal tool — who wants a proven, observable foundation rather than assembling one from primitives.
