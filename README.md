# BrandOS AI — Enterprise Brand Governance Platform

> **Every claim verified. Every brand protected.**

BrandOS AI is an enterprise AI brand governance platform that checks marketing content against approved corporate brand guidelines. It identifies unsupported claims, detects regulatory contradictions, explains findings with verifiable ground-truth source evidence, suggests corrections, and keeps humans in control of final approvals.

---

## 1. System Architecture

BrandOS AI is built with a decoupled, high-performance architecture:
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts, React Hook Form + Zod.
- **Backend API Server:** Node.js, Express.js 5, TypeScript, Zod.
- **AI Engine:** Google Gemini API (`gemini-3.8-flash`) via the modern `@google/genai` SDK with structured JSON output and timeout/retry error management.
- **Data & Storage:** Supabase Cloud (PostgreSQL with Row Level Security, Supabase Auth JWT middleware, and Supabase Storage).
- **RAG & NLP Pipeline:** Local page-aware PDF text extraction (`pdf-parse`), semantic heading & rule chunking, BM25-inspired token similarity retrieval, and strict citation grounding validator.

```
┌─────────────────────────────────────────────────────────────┐
│                      BrandOS Frontend                       │
│    (Overview, Knowledge, Review, Queue, Audit, Analytics)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                    BrandOS Express Server                   │
│   Auth Middleware • Persona Switcher • Upload Guardrails    │
├──────────────────────────────┬──────────────────────────────┤
│      RAG Pipeline            │      Governance Engine       │
│ • PDF Extractor & Chunker    │ • Review State Machine       │
│ • Keyword Passage Ranker     │ • Human Approval Service     │
│ • Strict Evidence Validator  │ • Immutable Audit Ledger     │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
┌──────────────▼───────────────┐ ┌────────────▼───────────────┐
│     Google Gemini Engine     │ │    Supabase Cloud DB &     │
│       @google/genai          │ │      Storage Buckets       │
│  (Configurable via .env)     │ │   (Configurable via .env)  │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 2. Feature Capability Matrix (With vs Without Credentials)

The system starts and runs out of the box in a clearly labelled development mode when external credentials are not yet configured:

| Capability | Without External Credentials (`ALLOW_DEV_FALLBACK=true`) | With Credentials Configured (`.env`) |
| :--- | :--- | :--- |
| **PDF Guideline Ingestion** | Local in-memory PDF extraction & page-aware chunking | Extracted locally & saved to Supabase Storage bucket |
| **Passage Retrieval** | Deterministic token similarity & keyword ranking | Vector / keyword ranking over indexed guidelines |
| **Claim Analysis** | Deterministic rule matcher detecting FTC/FDA, ESG & voice violations | Gemini 3.8 Flash structured JSON analysis |
| **Evidence Validation** | Verbatim ground-truth passage check (`needs_verification` fallback) | Verbatim ground-truth passage check (`needs_verification` fallback) |
| **Review State Transitions**| Full state machine (`pending` → `ready_for_approval` → `approved`) | Full state machine with Postgres persistence |
| **Human Approvals** | Interactive sign-off (Approve / Request Revisions / Reject) | Recorded in `approval_decisions` table with RLS |
| **Audit Ledger** | Memory-buffered chronological immutable audit history | Persisted in `audit_events` Postgres table |
| **Analytics Engine** | Real-time computed breakdown, trends & violation frequencies | Aggregated from live database records |
| **Strict Service Errors** | When `ALLOW_DEV_FALLBACK=false`, returns explicit `503 SERVICE_NOT_CONFIGURED` | Full cloud execution |

---

## 3. Quick Start

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation
```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run unit and integration tests
npm test

# 3. Start the Express backend server (Port 5000)
npm run server

# 4. In a separate terminal, start the Vite frontend (Port 5173)
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 4. External Credentials & Setup Instructions

To transition from the local development mode to live production cloud services, follow these setup steps:

### A. Google Gemini AI Integration
1. Go to [Google AI Studio](https://aistudio.google.com/) and sign in with your Google account.
2. Click **Get API key** and generate an API key.
3. Open your `.env` file (copied from `.env.example`) and set:
   ```env
   GEMINI_API_KEY=AIzaSy...your-gemini-key
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_TIMEOUT_MS=30000
   ```
4. Once set, all content reviews automatically use live Gemini 3.8 Flash inference with structured Zod output validation.

---

### B. Supabase Database, Auth & Storage Integration
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. In your Supabase project dashboard, navigate to **Project Settings** → **API**.
3. Copy the **Project URL**, the **anon public key**, and the **service_role key**.
4. In `.env`, add the copied credentials:
   ```env
   SUPABASE_URL=https://<your-project-id>.supabase.co
   SUPABASE_ANON_KEY=<your-supabase-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   SUPABASE_STORAGE_BUCKET=brand-guidelines
   ```

#### 5. Run Database Migrations in Supabase
In your Supabase project dashboard, open the **SQL Editor** and run the two migration scripts in order:

1. **Schema Migration:** Open and execute `server/db/migrations/001_initial_schema.sql`
   - Creates tables: `workspaces`, `profiles`, `brand_documents`, `document_sections`, `review_drafts`, `findings`, `approval_decisions`, and `audit_events`.
   - Creates foreign key constraints, indexes, and automated `updated_at` triggers.
   - Populates initial workspace and role seed data.

2. **Row Level Security (RLS) Migration:** Open and execute `server/db/migrations/002_rls_policies.sql`
   - Enables Row Level Security on all tables.
   - Creates helper functions `auth_workspace_id()` and `auth_user_role()`.
   - Enforces strict tenant workspace isolation and role permissions.

#### 6. Create Storage Bucket
1. In the Supabase dashboard, click **Storage** → **New bucket**.
2. Name the bucket `brand-guidelines`.
3. Set public access according to your preference (or leave private with signed access).

---

## 5. Security & Configuration Validation

- **Safe Configuration Validation:** At startup, `server/config/env.ts` evaluates all required environment variables and outputs a status report:
  ```
  [BrandOS Config] Google Gemini AI: CONFIGURED (gemini-3.8-flash)
  [BrandOS Config] Supabase Database & Auth: CONFIGURED
  ```
  If variables are missing, it lists the missing variable names without printing secret keys or values.
- **Fail-Safe Behavior:** If external credentials are absent and `ALLOW_DEV_FALLBACK=false`, the server returns an explicit `503 ServiceNotConfiguredError` with `{ code: "SERVICE_NOT_CONFIGURED", missingVariables: [...] }`. No fake data or fabricated AI outputs are ever generated in strict mode.
- **Evidence Verification Grounding:** The evidence validator (`server/services/rag/evidenceValidator.ts`) cross-checks every AI citation against extracted guideline text. If an AI finding lacks verbatim citation or its relevance score falls below 60%, the finding is automatically flipped to `needs_verification` with an explicit reason.

---

## 6. Testing

The repository includes a comprehensive test suite using Vitest and Supertest:

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage
- `server/tests/chunker.test.ts`: PDF text parsing, page splitting, heading detection, rule count heuristics, and stop-word filtered keyword extraction.
- `server/tests/retriever.test.ts`: Keyword & token similarity ranking against guideline sections.
- `server/tests/evidenceValidator.test.ts`: Verbatim grounding checks, hallucination rejection, and `needs_verification` status flips.
- `server/tests/stateMachine.test.ts`: Review status transitions, role permissions (preventing Creator approval self-authorizations), and illegal jump rejections.
- `server/tests/envValidation.test.ts`: Missing environment variable detection without secret leakage.
- `server/tests/apiIntegration.test.ts`: Supertest validation of all Express REST endpoints (`/api/health`, `/api/documents`, `/api/reviews`, `/api/audit`, `/api/analytics`).

---

## 7. REST API Endpoints Contract

### Health & Diagnostics
- `GET /api/health` — System status, active mode, and external integration health.

### Guidelines & Documents
- `GET /api/documents` — List brand guidelines with optional filters (`search`, `category`, `status`).
- `GET /api/documents/:id` — Retrieve a single document and all extracted sections.
- `POST /api/documents/upload` — Upload PDF (`multipart/form-data`), extract text, chunk into sections, upload to storage, and index rules.
- `PATCH /api/documents/:id/archive` — Toggle document active/archived status.
- `DELETE /api/documents/:id` — Remove document from active registry.

### Content Reviews & Decisions
- `GET /api/reviews` — List review drafts with filtering by status and content type.
- `GET /api/reviews/:id` — Retrieve single review draft with findings, stats, and evidence passages.
- `POST /api/reviews` — Submit copy for review, execute RAG pipeline, and generate evidence-backed findings.
- `POST /api/reviews/:id/suggestions/:findingId/apply` — Apply suggested correction to active draft text.
- `POST /api/reviews/:id/suggestions/:findingId/reject` — Reject suggested correction.
- `PATCH /api/reviews/:id/draft` — Manually edit draft text.
- `POST /api/reviews/:id/decision` — Submit formal human decision (`approved`, `changes_requested`, `rejected`) with reviewer comments.

### Audit & Analytics
- `GET /api/audit` — Immutable chronological audit events.
- `GET /api/analytics` — Quantitative governance metrics, compliance rate, and category breakdowns.

### Workspaces & User Personas
- `GET /api/auth/me` — Current user profile.
- `POST /api/auth/switch` — Switch active user persona.
- `GET /api/users` — Available team members.
- `GET /api/workspaces` — Accessible workspaces.
- `GET /api/workspaces/current` — Currently active workspace.
- `POST /api/workspaces/switch` — Switch active workspace context.
