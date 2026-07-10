# HobbyFi Copilot — System Architecture

> **A production-grade AI copilot for sports academy management, built with Mastra AI orchestration, layered memory, pgvector RAG, multi-agent reasoning, and business analytics.**

---

## 1. Design Philosophy

HobbyFi Copilot was built with four architectural principles:

1. **Isolation-first**: Every tenant (vendor) operates in a silo. All queries are `vendorId`-scoped at the repository layer. Cross-vendor data access is structurally impossible.
2. **Approval-gated writes**: Every mutation creates a `PendingApproval` preview row. No data changes without explicit human sign-off.
3. **Semantic knowledge retrieval**: Instead of keyword matching, domain knowledge is retrieved via embedding similarity (pgvector + Gemini), ensuring relevant context reaches the LLM even with fuzzy queries.
4. **Self-healing AI**: Every failure mode — rate limits, quota exhaustion, missing data — is caught and gracefully degraded. The system never returns a raw error to the end user.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Next.js App (Vercel)                       │
│                                                                  │
│  ┌───────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Route Handlers    │  │  Mastra      │  │  Analytics        │  │
│  │  /api/copilot/*    │──│  Agent       │──│  Engine           │  │
│  │  /api/auth/*       │  │  (hobbyfi)   │  │  (analytics.query)│  │
│  │  /api/health       │  └──────┬───────┘  └──────────────────┘  │
│  └───────────────────┘         │                                │
│                                │                                │
│  ┌─────────────────────────────┼────────────────────────────┐   │
│  │            Mastra Tool Layer│                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │revenue   │ │user      │ │membership│ │notification│  │   │
│  │  │.query    │ │.search   │ │.update   │ │.send       │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌────────────────────────────┼─────────────────────────────┐   │
│  │            Service Layer   │                             │   │
│  │  ┌──────────────┐ ┌───────┴────────┐ ┌───────────────┐  │   │
│  │  │ MemoryManager │ │ RAG Engine     │ │ Orchestrator  │  │   │
│  │  │ 3 providers   │ │ pgvector+Gemini│ │ processMessage│  │   │
│  │  └──────────────┘ └────────────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌────────────────────────────┼─────────────────────────────┐   │
│  │          Data Layer        │                             │   │
│  │  ┌─────────────────────────────────────────────┐         │   │
│  │  │   Neon PostgreSQL (pgvector enabled)        │         │   │
│  │  │   Vendors │ Users │ Bookings │ Payments     │         │   │
│  │  │   Revenue │ PendingApprovals │ AuditLog     │         │   │
│  │  │   Documents (vector(3072))                  │         │   │
│  │  └─────────────────────────────────────────────┘         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Mastra AI Orchestration

### 3.1 Agent Architecture

The system uses [Mastra Core v1.50.1](https://mastra.ai) as its AI orchestration framework. A single primary agent handles all vendor interactions:

**`hobbyfiAgent`** (`src/lib/server/mastra/agent.ts`)
- **Model**: Google Gemini 2.0 Flash (configurable via `LLM_MODEL` env var)
- **Provider SDK**: `@ai-sdk/google`
- **Reasoning strategy**: Multi-step tool calling with `maxSteps: 10`
- **System prompt**: Structured instructions covering tool descriptions, write-vs-read distinction, approval flow, and response formatting

### 3.2 Tool System

Tools are registered as first-class objects via Mastra's `createTool()` factory, with Zod input schemas and natural-language descriptions that the LLM uses for autonomous routing.

| Tool ID | Type | Description |
|---------|------|-------------|
| `revenue.query` | Read | Aggregated revenue with range filters (today, yesterday, week, month, custom) |
| `user.search` | Read | Multi-filter member search (sport, trial status, expiry, name/phone) |
| `membership.update` | Write (approval required) | Extend trial, set membership end, upgrade plan |
| `notification.send` | Write (approval required) | Send reminders and alerts to members |
| `analytics.query` | Read (LLM-enriched) | AI-powered business analytics with 8 metric types (see §6) |

### 3.3 RequestContext

Each request carries a typed `RequestContext<{ vendorId; conversationId }>` that is:
1. Created by the orchestration layer from the JWT-authenticated request
2. Passed to every tool execution
3. Used by tools to scope all queries to the requesting vendor

This ensures tenant isolation at the framework level — tools never receive a vendor ID from user input.

### 3.4 Multi-Step Reasoning

When a user makes a compound request (e.g., "Extend Rahul Verma's trial by 7 days"), the agent autonomously:
1. Calls `user.search` with the provided name
2. Extracts the matching user's `userId` from results
3. Calls `membership.update` with the `userId` and `extendByDays`
4. Returns the approval preview to the user

This replaces a traditional regex-based intent classifier and tool registry — the LLM handles both classification and argument extraction.

---

## 4. Layered Memory Architecture

The memory system (`src/lib/server/memory/`) is designed around three swappable interfaces, each backed by a different storage technology suited to its access pattern.

### 4.1 Architecture

```
┌──────────────────────────────────────────────────┐
│                  MemoryManager                    │
│  Orchestrates all three providers into a single  │
│  context payload for the agent                   │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌──────────────────┐
│ Session   │  │ Vendor       │  │ Knowledge         │
│ Memory    │  │ Memory       │  │ Memory            │
├──────────┤  ├─────────────┤  ├──────────────────┤
│ Redis    │  │ PostgreSQL   │  │ pgvector RAG      │
│ (in-    │  │ (VendorPref- │  │ (embeddings +    │
│ memory  │  │ erence table)│  │ cosine search)   │
│ fallback)│  │              │  │                   │
└──────────┘  └──────────────┘  └──────────────────┘
```

### 4.2 Session Memory (`ISessionMemory`)

**Purpose**: Per-conversation ephemeral state — conversation history, last intent, last tool result.

**Storage**: Redis via `RedisSessionMemory`. Falls back to an in-memory `Map` when Redis is unavailable (local dev).

**Data shape**:
```typescript
interface SessionData {
  conversationHistory: ConversationTurn[];  // max 20 turns
  lastIntent?: string;
  lastToolResult?: Record<string, unknown>;
  turns: number;
}
```

**Key design decision**: History is truncated to 20 turns (configurable via `MAX_HISTORY_TURNS`). Only the last 6 turns are injected into the agent context, balancing context window usage against conversational continuity.

### 4.3 Vendor Memory (`IVendorMemory`)

**Purpose**: Persistent vendor preferences — default sport filter, favorite reports, language, timezone.

**Storage**: PostgreSQL `VendorPreference` table via `PostgresVendorMemory`.

**Key design decision**: Preferences are loaded once per request and injected as a system message prefix, allowing the agent to personalize responses without explicit user configuration.

### 4.4 Knowledge Memory (`IKnowledgeMemory`)

**Purpose**: Retrieval of domain knowledge — pricing, policies, FAQs, vendor guides.

**Storage**: pgvector RAG via `RAGKnowledgeMemory` (replaced the original `StaticKnowledgeMemory` keyword-based approach).

**Implementation**: `RAGKnowledgeMemory` wraps the RAG engine's `retrieve()` function. On first access, it auto-initializes the pgvector table, ingests 16 seed documents, and creates the IVFFlat index. All subsequent queries embed the input and perform cosine similarity search.

**Why RAG over static**: The original keyword-based search required exact term matching. RAG with embeddings understands semantic similarity — "How much does it cost?" matches pricing documents even though "cost" isn't in every title.

---

## 5. RAG (Retrieval Augmented Generation)

### 5.1 Pipeline

```
User Query
    │
    ▼
┌──────────────┐    ┌─────────────────────┐
│  embed query  │───▶│ google.embedding    │
│  (3072 dims)  │    │ "gemini-embedding-2"│
└──────────────┘    └─────────────────────┘
    │
    ▼
┌──────────────────┐
│  pgvector search  │
│  cosine distance  │
│  1 - (v <=> q)   │
│  threshold: 0.3   │
│  limit: 5         │
└──────────────────┘
    │
    ▼
┌──────────────────┐    ┌─────────────────────┐
│  format context   │───▶│  Agent context      │
│  as system msg    │    │  (prepended before  │
│  with scores      │    │   conversation)     │
└──────────────────┘    └─────────────────────┘
```

### 5.2 Embedding Model

- **Provider**: Google Gemini (`@ai-sdk/google`)
- **Model**: `gemini-embedding-2`
- **Dimensions**: 3072
- **API**: `ai/embed` (single) and `ai/embedMany` (batch) from the Vercel AI SDK

### 5.3 Vector Index

```sql
CREATE INDEX IF NOT EXISTS idx_documents_embedding
ON documents USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);
```

**Why IVFFlat over HNSW**: pgvector's HNSW implementation caps at 2000 dimensions. Gemini embeddings are 3072-dim, so IVFFlat with cosine similarity is the only viable index type.

### 5.4 Seed Data

16 documents across 6 categories are auto-ingested on first chat request:

| Category | Documents | Coverage |
|----------|-----------|----------|
| `pricing` | Monthly, trial, annual pricing | Cost-related queries |
| `membership-policy` | Cancellation policy | Membership rules |
| `trial-rules` | Cancellation, extension | Trial management |
| `refund-policy` | Standard, medical exception | Refund handling |
| `vendor-guide` | Dashboard, member management, documents, coach assignment | Operational queries |
| `faq` | Sports, timings, switching, renewal | General inquiries |

### 5.5 Injection Strategy

RAG context is injected as a system message (not user message) prepended to the conversation history. This means:
- The LLM treats it as authoritative context, not new user input
- It doesn't pollute the conversation history visible to the user
- It's regenerated on every turn, ensuring freshness

---

## 6. Business Analytics Engine

### 6.1 Architecture

```
User query: "How's my revenue trending?"
    │
    ▼
hobbyfiAgent recognizes analytics intent
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  analytics.query tool                                   │
│                                                         │
│  1. Parse metric + timeframe from input                 │
│  2. Route to SQL query function                         │
│  3. Return raw data → LLM enrichment (generateObject)   │
│  4. Return { summary, insights, recommendations,       │
│              charts, kpis, rawData }                    │
└────────────────────────────────────────────────────────┘
    │
    ▼
hobbyfiAgent formats the analytics output into a natural
response, referencing KPI values and recommendations
```

### 6.2 Query Layer

Each of the 8 metrics (`queries.ts`) executes Prisma queries scoped to the requesting vendor. The query layer handles:
- **Date range computation**: Translates `7d`, `30d`, `90d`, `this_month`, `last_month` into precise `Date` ranges
- **Period-over-period comparison**: Computes previous-period data for change percentages
- **Multi-dimensional breakdowns**: By sport, by status, by method, by month

### 6.3 LLM Enrichment

Raw query results are passed to `generateObject()` from the Vercel AI SDK with a Zod output schema:

```typescript
const AnalyticsOutputSchema = z.object({
  summary: z.string(),                        // Executive summary
  insights: z.array(z.string()),               // 3-5 data-backed insights
  recommendations: z.array(z.string()),        // 2-3 actionable recommendations
  charts: z.array(ChartDataSchema),            // Chart-ready JSON arrays
  kpis: z.array(KpiSchema),                    // Key metrics with trends
});
```

**Graceful degradation**: When the LLM API is unavailable (quota exhausted, network error), the system returns a data-only fallback without the enriched analysis. The hobbyfiAgent's own LLM can still interpret the raw data.

### 6.4 Metric Catalog

| Metric | SQL Source | Output Highlights |
|--------|-----------|-------------------|
| `revenue_analysis` | `Revenue` table | Daily trend, online/offline split, period change % |
| `booking_trends` | `Booking` table | Daily volumes, confirmed/cancelled breakdown, by sport |
| `trial_conversion` | `User` table | Trial users vs paid users, conversion rate |
| `membership_growth` | `User` table | Monthly signups, type distribution (standard/premium/family) |
| `coach_performance` | `User` table | Member count per coach |
| `peak_hours` | `Booking` table | Booking density by slot, cancellation rates per slot |
| `cancellation_rate` | `Booking` table | Overall rate, per-sport breakdown |
| `payment_success_rate` | `Payment` table | Success/failure splits, by payment method |

### 6.5 Chart-Ready JSON

Each analytics response includes pre-structured chart data consumable by any charting library:

```json
{
  "charts": [{
    "type": "line",
    "title": "Daily Revenue Trend (Last 30 Days)",
    "labels": ["2026-06-10", "2026-06-11", ...],
    "datasets": [
      { "label": "Total Revenue", "values": [12500, 14300, ...] },
      { "label": "Online", "values": [8500, 9200, ...] },
      { "label": "Offline", "values": [4000, 5100, ...] }
    ]
  }]
}
```

This enables a future UI to render charts directly from the API response without additional data transformation.

---

## 7. Request Lifecycle

### 7.1 Chat Message Flow

```
HTTP POST /api/copilot/chat
  │
  ├─ 1. JWT middleware extracts vendorId, conversationId
  │
  ├─ 2. prompt injection guardrail (detectPromptInjection)
  │     └─ blocked → return policy-violation message
  │
  ├─ 3. MemoryManager.loadContext(vendorId, conversationId, message)
  │     ├─ Session: load conversation history (Redis/InMemory)
  │     ├─ Vendor: load preferences (PostgreSQL)
  │     └─ Knowledge: RAG vector search (pgvector + Gemini embed)
  │
  ├─ 4. Build enriched context
  │     └─ [RAG system message, vendor preferences, last 6 turns]
  │
  ├─ 5. hobbyfiAgent.generate(message, { context, maxSteps: 10 })
  │     ├─ LLM reasons → calls tools (zero or more)
  │     │   ├─ user.search, revenue.query, analytics.query (reads)
  │     │   └─ membership.update, notification.send (writes → approval)
  │     └─ Returns final text response + tool results
  │
  ├─ 6. Detect pending approvals from tool results
  │     └─ If previewId found → return approval card data
  │
  ├─ 7. MemoryManager.saveTurn(...)
  │     └─ Append turn to session history
  │
  └─ 8. Return { reply, pendingApproval? }
```

### 7.2 Approval Flow

```
User asks: "Upgrade Rahul to premium"
    │
    ▼
Agent calls membership.update → creates PendingApproval row in DB
    │
    ▼
API returns: { reply: "...", pendingApproval: { previewId, diff } }
    │
    ▼
User sees approval card → clicks Approve or Reject
    │
    ▼
POST /api/copilot/approve { previewId, action: "approve" | "reject" }
    │
    ├─ approve: execute the mutation, update status to "approved"
    └─ reject: discard mutation, update status to "rejected"
```

### 7.3 Analytics Query Flow

```
User asks: "Show me booking trends this month"
    │
    ▼
hobbyfiAgent → analytics.query({ metric: "booking_trends", timeframe: "this_month" })
    │
    ├─ 1. Prisma: GROUP BY date, status → raw booking data
    ├─ 2. Prisma: GROUP BY sport → sport breakdown
    ├─ 3. Gemini generateObject: enrich data → summary, insights, recommendations
    └─ 4. Return structured analytics
    │
    ▼
hobbyfiAgent formats response with KPI highlights and recommendations
```

---

## 8. Data Model

### 8.1 Core Business Tables (Prisma-managed)

```
Vendor ──┬── User (members)
         ├── Booking (sessions)
         ├── Payment (transactions)
         ├── Revenue (daily aggregates)
         ├── PendingApproval (write gating)
         ├── AuditLog (history)
         └── VendorPreference (settings)
```

**Key relationships**:
- `User.membershipType`: `"standard"`, `"premium"`, `"family"`, `"trial"`
- `User.trialStatus`: Boolean flag for current trial members
- `Booking.status`: `"confirmed"`, `"cancelled"`, `"pending"`
- `Payment.status`: `"success"`, `"failed"`, `"pending"`, `"refunded"`
- `Payment.method`: `"online"`, `"offline"`, `"upi"`, `"card"`

### 8.2 RAG Table (raw SQL)

```sql
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  vendor_id   TEXT,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL,
  embedding   vector(3072),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

This table is managed via raw SQL (not Prisma migrations) because:
- The `vector` column type requires pgvector extension
- Prisma's client cannot deserialize vector columns in SELECT *
- All SELECT queries explicitly exclude the `embedding` column

---

## 9. Deployment Architecture

### 9.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Hosting | Vercel (serverless) | Zero-config Next.js deployment, edge CDN |
| Framework | Next.js 14 App Router | API routes + frontend in one project |
| AI Framework | Mastra Core v1.50.1 | First-class agent/tool abstractions |
| AI Provider | Google Gemini 2.0 Flash | Cost-effective, fast inference |
| Embeddings | Google Gemini Embedding 2 | 3072-dim, high-quality semantic search |
| Database | Neon PostgreSQL | Serverless Postgres, pgvector support |
| ORM | Prisma | Type-safe queries, migrations |
| Auth | JWT (jsonwebtoken) | Stateless, no session store needed |

### 9.2 Serverless Considerations

**Prisma singleton**: In serverless environments, each invocation creates a new Prisma client. The `globalThis` caching pattern prevents connection pool exhaustion:

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
```

**RAG initialization race condition**: The `ensureTable()` method drops and recreates the documents table. An in-memory `ragInitialized` flag prevents re-execution within a single invocation, but across invocations the table is assumed to already exist.

### 9.3 Environment Configuration

| Variable | Purpose |
|----------|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API authentication |
| `LLM_MODEL` | Model override (default: `gemini-2.0-flash`) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Token signing key |
| `ALLOWED_ORIGINS` | CORS origin whitelist |

---

## 10. Security Model

### 10.1 Tenant Isolation

- **API layer**: JWT contains `vendorId`; every route handler extracts it from the verified token
- **Tool layer**: `RequestContext.get("vendorId")` supplies vendor identity — tools never accept it from user input
- **Repository layer**: Every `where` clause includes `{ vendorId }` — Prisma types enforce this
- **Cross-vendor prevention**: No query across the entire codebase reads data without a `vendorId` filter

### 10.2 Prompt Injection Guardrails

Before any LLM processing, every user message runs through `detectPromptInjection()` — a lightweight pattern-based pre-filter that blocks:
- System prompt override attempts
- Role-play/character injection
- Delimiter escape patterns
- Instruction leakage probes

Blocked requests receive a generic policy violation response (never "you were blocked for X reason," which would give attackers signal).

### 10.3 Write Approval Gating

All mutation tools (membership.update, notification.send) follow a 5-state approval machine:

```
pending → approved  → mutation executed → logged
pending → rejected  → mutation discarded → logged
pending → expired   → mutation discarded → logged
```

State transitions are recorded in `AuditLog`, providing a complete audit trail.

---

## 11. Testing & Observability

### 11.1 Logging

A structured logger (`src/lib/server/lib/logger.ts`) wraps `console` with:
- **Levels**: `info`, `warn`, `error`
- **Structured metadata**: `{ vendorId, conversationId, durationMs, error }`
- **Context**: Automatically includes module name and timestamp

### 11.2 Health Check

`GET /api/health` verifies:
1. Server responds (200 OK)
2. Database connectivity (prisma.$queryRaw\`SELECT 1\`)
3. Returns environment metadata

### 11.3 Key Error Scenarios Covered

| Scenario | Handling |
|----------|----------|
| LLM API quota exhausted | Caught at orchestration layer → friendly error message |
| RAG retrieval failure | Logged as warning → agent proceeds without RAG context |
| Analytics LLM enrichment failure | Falls back to raw data analysis |
| Invalid JWT | Returns 401 Unauthorized |
| Write without user.search first | Agent's system prompt instructs the correct sequence |

---

## 12. Future Extensibility

1. **Mastra Workflows**: Complex multi-step processes (e.g., member onboarding that chains trial creation → coach assignment → welcome notification) can be modeled as typed Mastra Workflows with conditional branching and parallel execution.

2. **Upstash Redis**: Replace the in-memory Redis fallback with Upstash for true serverless session sharing.

3. **Multi-agent delegation**: The analytics tool demonstrates the pattern — specialized sub-agents can be added for reporting, compliance, or member engagement, each with their own toolset and memory scope.

4. **Real-time notifications**: WebSocket or polling for approval status changes improves UX when waiting for write operations.

5. **Scheduled analytics**: Cron-triggered analytics reports delivered as push notifications or email digests.

---

*Document generated: July 2026*
*Stack: Next.js 14 · Mastra Core 1.50.1 · Prisma ORM · Neon PostgreSQL · Google Gemini 2.0 Flash · pgvector · Zod · JWT*
