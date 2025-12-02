# LLFA - Local Lead Finder Agent

## Overview

LLFA (Local Lead Finder Agent) is an autonomous AI agent system designed to find and qualify local business leads. The application uses an AI agent that searches for businesses via Google Places API, audits their websites for technical issues and marketing gaps, and scores them based on Need (technical issues), Value (business potential), and Reachability (contact info quality).

The system features a mission console where users can interact with the agent, view real-time mission progress, and browse a database of qualified leads with detailed metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, built using Vite as the build tool and development server.

**UI Component Library**: Shadcn UI (New York variant) with Radix UI primitives for accessible, unstyled components. The UI uses Tailwind CSS v4 for styling with a custom design system featuring Inter and JetBrains Mono fonts.

**Routing**: Wouter for client-side routing with four main pages:
- Mission Console (`/`) - Agent chat interface and real-time mission monitoring
- Leads Database (`/leads`) - Searchable table of discovered leads with expandable details
- My Lists (`/lists`) - Lead list management with create, view, and delete functionality
- Settings (`/settings`) - Configuration for AI providers and agent behavior

**State Management**: TanStack Query (React Query) for server state management with automatic caching, background refetching during active missions, and optimistic updates.

**Animations**: Framer Motion for UI transitions and real-time activity feeds.

**Design Decisions**:
- Single-page application architecture with code-splitting via Vite
- Component-based architecture with reusable UI primitives from Shadcn
- Real-time updates using polling (2-second intervals during active missions)
- Responsive design with mobile-first approach using Tailwind breakpoints

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js.

**Database ORM**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe database operations.

**API Structure**: RESTful API with the following endpoints:
- `/api/settings` - GET/POST for agent configuration (API keys, provider selection, scoring preferences)
- `/api/leads` - GET for retrieving leads with filtering and pagination
- `/api/missions` - POST for starting missions, GET for retrieving mission details
- `/api/missions/:id/events` - GET for mission event logs (agent actions, tool calls, errors)

**Agent System**: Custom AI agent loop implementation with:
- LLM abstraction layer supporting both OpenAI (gpt-4o-mini) and Google Gemini (gemini-2.0-flash-exp)
- **Hardcoded mission pipeline**: search_places → audit_site → score_lead → save (not LLM tool-calling)
- Chat mode uses LLM for conversational responses about leads and scoring
- Mission state management with event logging
- Asynchronous execution with progress tracking

**System Prompt**: The chat system prompt accurately reflects the hardcoded architecture:
- Explains the automated mission pipeline
- Documents the scoring framework (Need/Value/Reachability)
- Clarifies the agent's role is to help users understand results, not execute tools
- Notes "draft outreach" as a planned future feature

**Database Schema**:
- `leads` - Business information (name, contact details, location, category, canonical_domain, normalized_phone)
- `lead_metrics` - Technical audit results (HTTPS, mobile-friendliness, performance, schema)
- `scores` - Multi-dimensional scoring (Need, Value, Reachability)
- `lead_lists` - User-created lead lists with three types: static (manual), snapshot (point-in-time), dynamic (real-time filter)
- `lead_list_members` - Many-to-many relationship between lists and leads
- `missions` - Agent mission tracking (status, goals, timestamps)
- `mission_events` - Detailed event logs for transparency
- `settings` - Key-value store for configuration

**Deduplication System**:
- Multi-layer deduplication prevents duplicate leads across missions
- Normalization utilities convert domains/phones to canonical formats
- Mission-level caching tracks processed placeIds, domains, and phones
- Upsert logic with fuzzy matching using Levenshtein distance (0.85 threshold)
- Unique constraints on place_id, canonical_domain, and (canonical_domain + phone)
- Backfill scripts available in `server/scripts/` for legacy data migration

**Build Process**: 
- Custom build script using esbuild for server bundling
- Selective dependency bundling (allowlist approach) to optimize cold start times
- Vite for client bundling with code splitting
- Production builds combine client and server into single `dist` directory

**Design Decisions**:
- Chose Drizzle ORM over Prisma for better TypeScript integration and zero runtime overhead
- Implemented storage abstraction layer (`IStorage` interface) for potential future database migrations
- Used PostgreSQL for ACID guarantees and complex query support
- Server-side rendering avoided to simplify deployment (static SPA + API)

### External Dependencies

**AI Providers**:
- **OpenAI API** - GPT models for agent reasoning and tool calling (configurable, default model: gpt-4-turbo)
- **Google Gemini API** - Alternative LLM provider via `@google/generative-ai` package

**Database**:
- **Neon PostgreSQL** - Serverless PostgreSQL via `@neondatabase/serverless` package
- Configured through `DATABASE_URL` environment variable
- WebSocket-based connection pooling for optimal Replit deployment

**Third-Party APIs**:
- **Google Places API** - Business search and place details (requires API key in settings)
- Used for discovering businesses based on location and category queries

**Web Scraping & Analysis**:
- **Cheerio** - HTML parsing for website auditing
- **Axios** - HTTP client for fetching websites and making API requests

**Development Tools**:
- **Replit-specific plugins**: 
  - `@replit/vite-plugin-runtime-error-modal` - Enhanced error reporting in development
  - `@replit/vite-plugin-cartographer` - Code navigation tools
  - `@replit/vite-plugin-dev-banner` - Development mode indicator
- Custom `vite-plugin-meta-images` - Automatic OpenGraph image URL injection for Replit deployments

**Session Management**:
- **express-session** with **connect-pg-simple** - PostgreSQL-backed sessions
- Session data stored in database for persistence across deployments

**Deployment Considerations**:
- Application designed for Replit deployment with automatic DATABASE_URL provisioning
- Environment variables required: `DATABASE_URL`, AI provider API keys (configured via UI)
- Static asset serving through Express in production
- Vite dev server with HMR in development mode