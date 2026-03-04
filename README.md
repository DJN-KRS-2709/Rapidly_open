# Rapidly

Turn PRDs into interactive visual prototypes in minutes.

Rapidly takes a Product Requirements Document (PRD) as input, extracts its structure (problems, outcomes, jobs-to-be-done, user flows), and generates a fully interactive HTML prototype — complete with forms, dashboards, navigation, and brand-appropriate theming. No design tools, no coding, no waiting for a designer.

## How It Works

Rapidly processes a PRD through a four-stage pipeline:

### 1. Sectionize

The uploaded PRD (plain text, markdown, or PDF) is parsed into a structured document model — sections, subsections, and raw text blocks. This handles varied PRD formats and heading styles.

### 2. Extract (CPM)

The sectionized document is transformed into a **Canonical Prototype Model (CPM)** — a normalized data structure that captures:

- **Problem statement** — what the product solves
- **Target outcome** — the desired end state
- **Jobs to be done (JTBD)** — user goals with triggers and success criteria
- **User flows** — step-by-step sequences with actors, actions, and results
- **Entities and features** — key domain objects and structural signals

The CPM is the single source of truth for everything downstream.

### 3. Detect Theme & Domain

The CPM content is analyzed to determine:

- **Domain type** — social media, marketplace, productivity, mobile consumer, or enterprise/strategy
- **Brand detection** — recognizes specific brands (Airbnb, TikTok, Slack, etc.) and applies appropriate accent colors
- **Layout selection** — routes to the right prototype shell (bottom tab bar for social, search hero for marketplace, sidebar for productivity, etc.)

### 4. Generate Prototype

Each user flow is rendered as an interactive screen using **flow-context-aware UI inference**:

- Each step is classified into a UI component type (form, data table, search, selection cards, approval dialog, progress tracker, recommendations, success state, media player, etc.)
- Classification uses both the **individual step text** and the **flow name / job description** for context — so a step like "Process user request" inside a "Report an issue" flow renders as a data review panel, not a generic card
- Components are rendered with real interactive elements: input fields, dropdowns, textareas, buttons, charts, metric cards, progress rings, and confirm/cancel actions

The result is a self-contained HTML file with tabbed navigation, interactive UI components, and brand-appropriate styling.

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Main review UI (upload, edit CPM, regenerate)
│   ├── prototype/[runId]/page.tsx  # Full-viewport prototype viewer (iframe)
│   └── api/
│       ├── upload-prd/             # POST: upload PRD → sectionize → extract CPM
│       ├── runs/                   # GET: list all runs
│       └── run/[runId]/
│           ├── regenerate/         # POST: regenerate prototype from CPM
│           ├── prototype-html/     # GET: serve generated HTML prototype
│           ├── cpm/                # GET/PUT: read or update CPM
│           ├── save/               # POST: save reviewed CPM
│           ├── theme/              # PUT: update theme settings
│           └── outputs/            # GET: list generated output files
├── lib/
│   ├── sectionize.ts               # PRD → structured sections
│   ├── extract.ts                  # Sections → CPM (canonical prototype model)
│   ├── themeDetection.ts           # CPM → theme, domain, brand detection
│   ├── prototypeHtml.ts            # CPM → interactive HTML (all layout types)
│   ├── prototypeInference.ts       # Step text → UI component type inference
│   ├── prototypeDesignSystem.ts    # Shared CSS, fonts, icons
│   ├── prototypeEnrichment.ts      # Optional LLM-powered mock data generation
│   ├── prototypeDiagrams.ts        # Mermaid-based architecture/flow diagrams
│   └── prototypeBlueprint/         # Blueprint planner and renderer
└── components/
    ├── RapidlyWrapper.tsx           # App shell with header and theme
    └── RapidlyHeader.tsx            # Top navigation bar
```

## Prototype Layout Types

| Domain | Layout | Example Brands |
|---|---|---|
| **Marketplace** | Search hero, photo card grids, top tab navigation | Airbnb, Uber, Shopify, Amazon |
| **Social** | Dark/light feed, bottom tab bar, stories row | TikTok, Instagram, Snapchat, Discord |
| **Productivity** | Sidebar navigation, channel/page list, content area | Slack, Notion, Linear, Jira |
| **Mobile Consumer** | Phone-frame, bottom nav, flow-based screens | Fitness apps, streaming, health |
| **Strategy/Enterprise** | Sidebar dashboard, wizard screens, data tables | Internal tools, B2B products |
| **Generic Consumer** | Top nav, card-based content, clean layout | Fallback for unrecognized domains |

## UI Component Types

Steps in user flows are rendered as real interactive components:

| Component | Rendered As | Triggered By |
|---|---|---|
| **Form** | Dropdowns, textareas, submit buttons | "report", "create", "submit", "fill" |
| **Data Table** | Metric cards, bar charts, summary panels | "analytics", "review", "details", "prepare" |
| **Search** | Search bar with result list | "search", "find", "discover" |
| **Selection Cards** | Selectable option grid | "select", "choose", "pick", "resolution" |
| **Approval** | Review summary with confirm/cancel | "review and confirm", "approve" |
| **Success State** | Checkmark with completion message | "completed", "resolved", "goal achieved" |
| **Progress Tracker** | Ring chart and progress bar | "progress", "goal", "streak", "motivated" |
| **Recommendations** | Suggestion cards with icons | "recommend", "suggest", "improve" |
| **Media Player** | Video player with scrubber | "play", "watch", "stream" |
| **Access Gate** | Lock screen with upgrade CTA | "premium", "subscribe", "upgrade" |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Configure (optional)

Copy the example env file if you want LLM-powered mock data enrichment:

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` and `RAPIDLY_PROTOTYPE_ENRICH=true` to enable AI-generated mock data in prototypes. This is entirely optional — prototypes work without it.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload a PRD, and click **Generate Prototype**.

### Build

```bash
npm run build
npm start
```

### Test

```bash
npm test
```

## Data Storage

All run data is stored locally in the `runs/` directory. Each run gets a timestamped folder containing:

- `cpmRaw.json` — extracted CPM (before user edits)
- `cpmReviewed.json` — CPM after user review and alignment
- `prototype.html` — the generated interactive prototype
- `prototypePlan.json` — blueprint plan for the prototype
- `figma_make_prompt.txt` — generated Figma design prompt
- `reviewed_output.txt` — processed output summary

No database required. Runs persist across restarts.

## Tech Stack

- **Next.js 15** with App Router and Turbopack
- **React 19** with Server Components
- **MUI 7** (Material UI) for the review interface
- **Zustand** for client state management
- **Framer Motion** for animations
- **Mermaid** for architecture diagrams
- **OpenAI SDK** (optional) for mock data enrichment

## License

MIT
