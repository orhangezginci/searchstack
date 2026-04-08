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

- [ ] **PDF extraction service** — new microservice using PyMuPDF or pdfplumber. Accepts a PDF, chunks it by page or paragraph, publishes chunks to the RabbitMQ fanout exchange. No changes to any other service — the event bus absorbs the new producer transparently.
- [ ] **Schema-flexible metadata** — replace hardcoded `title/cuisine/text` fields with configurable metadata keys so any document type can be indexed without changing the search services.
- [ ] **Chunk-aware result rendering** — results show the matched excerpt and page number, not just the document title.
- [ ] **Reference implementation** — a working `docker-compose.pdf.yml` that spins up the full stack configured for document search. Pull, drop PDFs into a folder, search.

This phase proves the core claim: **add a pipeline, get intelligent search out of the box.**

---


---

## Phase 3 — Config-Driven Framework
*From demo to boilerplate*

- [ ] **`search-arena.yml` config** — define collections, schemas, embedding models, and thresholds in a single file. Services read config at startup rather than hardcoding values.
- [ ] **Collection bootstrapper** — on first run, reads the config and creates all Qdrant collections, Elasticsearch indices, and RabbitMQ exchanges automatically.
- [ ] **Generic frontend** — result renderer driven by config schema, not hardcoded recipe/image modes. A developer configures fields and the UI adapts.
- [ ] **Model registry** — swap embedding models (MiniLM, MPNet, BGE, OpenAI) via a single config line without rebuilding any service.

---

## Phase 4 — CLI Scaffold
*The thesis statement of the whole project*

```bash
npx create-search-arena my-project --pdf --library-frontend
```

A developer answers a few prompts — content type, embedding model, frontend or API-only — and gets a working, customised search stack. No reading docs, no editing configs by hand.

- [ ] **`create-search-arena` CLI** — selects and composes existing, tested services based on flags. Generates `docker-compose.yml`, `search-arena.yml`, and a pre-filled README. Doesn't generate code — it assembles what already exists.
- [ ] **Pipeline plugins** — each content type (`--pdf`, `--email-imap`, `--calendar-ical`) is a self-contained service in `services/pipelines/`. The CLI picks which ones to include.
- [ ] **Frontend plugins** — `--frontend demo` (current full UI) or `--frontend library` (clean document search UI). API-only mode omits the frontend entirely.
- [ ] **One-command cloud deploy** — a deploy script targeting Fly.io or Railway for teams that want a hosted instance without managing Docker infrastructure themselves.

---

## Optional — MCP Integration
*AI client layer, not a framework requirement*

MCP (Model Context Protocol) is the right way to connect this retrieval engine to an LLM — but it belongs after the framework is solid, not on the critical path to it. A developer embedding search into their own product doesn't need MCP. It becomes relevant when the consumer is an AI assistant rather than application code.

```
LLM Client  ──MCP──►  MCP Server (~100 lines)  ──HTTP──►  API Gateway  ──►  Qdrant + ES
```

- [ ] **MCP server** — exposes `search_documents(query, collection, mode)`, `list_collections()`, and `get_document(id)` as MCP tools. Added to `docker-compose.yml` as an opt-in service.
- [ ] **RAG demo** — Claude queries the indexed corpus directly: *"summarize everything we have on GDPR compliance"* — retrieval handled by this project, synthesis handled by the LLM. No custom chat UI needed.

**Why not earlier?** MCP is an integration story, not a framework feature. The framework value is in clean ingestion, config-driven setup, and the adapter pattern. MCP on top of a half-finished framework would just be a demo with extra steps.

---

## Positioning

Search Arena is a **semantic search scaffold** — infrastructure you run and extend, not a library you import.

The closest analogues are [Haystack](https://haystack.deepset.ai/) and [Unstructured.io](https://unstructured.io/) — both excellent but code-first: you assemble the pipeline yourself. Search Arena takes the opposite approach: **run it first, see it work, then extend it by adding a service**. The demo is not separate from the scaffold — it is the scaffold, with real data loaded in.

The target user is a developer who needs intelligent search over their own content — PDFs, emails, calendar entries, any corpus — and wants a proven, observable foundation to extend rather than build from scratch.
