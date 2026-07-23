# OmniLogin Frontend Guide

> **For AI Agents:** This is your primary source of truth for all frontend development in this repository. Follow these conventions strictly.

## 1. Stack Overview
- **Framework:** Next.js 14+ (App Router).
- **Styling:** Tailwind CSS, Shadcn UI, Framer Motion.
- **State Management:** React Query (for async data/API calls), Zustand (for UI state).
- **Forms:** React Hook Form + Zod.
- **Auth:** NextAuth (Credentials Provider with Native JWT).

### Directory Layout
```
frontend/
├── app/                  # Next.js App Router pages (layout.tsx, page.tsx)
├── src/
│   ├── components/       # Shared UI (Shadcn, basic parts)
│   ├── features/         # Feature-based module components (e.g., profiles, proxies)
│   ├── hooks/            # Custom React Hooks
│   ├── lib/              # Core utilities (auth, api, formatters)
│   ├── schemas/          # Zod validation schemas
│   └── store/            # Zustand stores
└── public/               # Static assets
```

## 2. Authentication (NextAuth Credentials)
Since OmniLogin uses Native JWT Backend instead of Keycloak:
- Authentication is handled exclusively by **NextAuth Credentials Provider**.
- Upon login, the NextAuth core stores `access_token` and `refresh_token` in session.
- Intercept NextAuth `session()` and `jwt()` callbacks in `auth.ts` to attach `accessToken` to the client.
- When `accessToken` expires, a silent refresh rotation occurs connecting back to `/auth/refresh` on the FastAPI server.

## 3. Data Fetching & State
- **Server Components (RSC):** Preferred where possible for SEO and initial load. Use direct `fetch` or internal database methods.
- **Client Components (`"use client"`):** Used for interactivity.
- **TanStack React Query:** 
  - ALWAYS use React Query for client-side API fetching (`useQuery`, `useMutation`).
  - Isolate keys tightly (`['profiles', id]`).
  - Use `onSuccess` in mutations to automatically invalidate query caches.
- **Zustand:** Use strictly for UI-only transient state (e.g., "is sidebar open", "active tab"). Do not store API data in Zustand.

## 4. Components & Formatting
- Code is built component-first. Do not create monolithic 1000-line single files.
- Prefer explicit imports (`import { Button } from "@/components/ui/button"`).
- Destructure props explicitly for readability.
- All forms **must** be validated by a `Zod` schema.
- **Tailwind Rules:** Only use utility classes. Do not use random inline styles (`style={{}}`). Use `cn()` from `lib/utils` to merge class names safely.

## 5. Clean Code & Code Review
- Ensure strict TypeScript typing (`any` is forbidden).
- Maintain "Feature-sliced design" where relevant components stay within `src/features/`.

## 6. Development Integration
- Remember the Frontend runs locally but connects to a local FastAPI Python layer (`http://localhost:8000`) functioning as the desktop's native engine. Be aware of CORS and proxy rules.
