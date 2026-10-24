# OSA Affiliate Income AI — Task 1: Fresh Project Audit Report

**Date & Time:** October 14, 2026  
**Repository:** `ddg2jnv78j-maker/OSA`  
**Current Branch:** `main`  
**Head Commit:** `71c3e4c8964dd03897f22b9bc643d1729fb5c9c7` (*Implement secure GitHub Releases auto-update system and in-app updater*)  
**Production URL:** https://osa-chat.com/  
**Audit Status:** Complete — Read-only verification (No existing project files or production configurations modified)

---

## 1. Executive Summary

OSA is a real-time communications platform built on **React 19 (TypeScript), Vite 8, Tailwind CSS, and Supabase (PostgreSQL 15+, Auth, Storage, Realtime WebSocket Channels)**, with multi-platform wrappers for **Android (Capacitor/Native Java WebView)**, **iOS (Capacitor/Swift)**, and **Web/PWA (Service Workers)**.

### Primary Audit Finding:
1. **Zero Existing Affiliate Infrastructure:** The repository currently has **no affiliate marketing partner integrations, no product catalog, no product recommendation algorithms, no outbound click or conversion tracking, and no revenue ledger**.
2. **Current AI Scope:** AI capability is strictly limited to an opt-in message drafting assistant (`src/services/aiService.ts`) utilizing `@google/genai` (Gemini 2.5 Flash via `VITE_GOOGLE_AI_API_KEY`) to suggest replies or polish message drafts in `ChatConversationView.tsx`.
3. **No Payment Gateway / Subscriptions:** There are no Stripe, bKash, Nagad, SSLCommerz, or in-app billing SDKs installed.
4. **Viability for Affiliate Income:** The technical foundation (high-performance chat UI, rich media attachments, Supabase Edge Functions, and real-time database) is robust. Affiliate monetization can be integrated natively without disrupting user messaging, calls, or security.

---

## 2. Repository, Branch & Commit Status

- **Remote Origin:** `https://github.com/ddg2jnv78j-maker/OSA.git`
- **Active Branch:** `main`
- **Latest Commit on Remote:** `71c3e4c8964dd03897f22b9bc643d1729fb5c9c7`
- **Recent Git Log:**
  - `71c3e4c` Implement secure GitHub Releases auto-update system and in-app updater
  - `d10b2f6` Add standalone native voice message notifications
  - `8004852` Add OSA chat voice message UI
  - `c30e7ff` Improve OSA video call startup and media controls
  - `1755698` Enhance Android background audio call notification controls, WebRTC audio routing, and SMTP config
- **Commit Safety Compliance:** No commits or pushes were executed during this audit.

---

## 3. Existing OSA Architecture & Features

### A. Frontend Architecture
- **Framework:** React 19 SPA (`src/App.tsx`, `src/main.tsx`) bundled with Vite 8.
- **Styling:** Tailwind CSS (`@tailwindcss/vite`).
- **Icons & Motion:** `lucide-react`, `motion`.
- **Internationalization (i18n):** Native bilingual support (`en` and `bn`) managed in `src/lib/i18n.ts`.

### B. Core Communication Features
1. **Direct & Group Chats:** Text, voice notes (`.m4a`/`.webm`), images, videos, audio files, and file attachments stored in Supabase Storage (`chat-attachments`).
2. **Voice & Video Calling:** Peer-to-peer WebRTC via Google STUN servers with hardware routing (earpiece, speakerphone, mute, camera toggle, screen sharing).
3. **Statuses / Stories:** Ephemeral 24-hour status posts with privacy controls (`everyone`, `contacts`, `nobody`).
4. **Presence & Last Seen:** Supabase Realtime Channels (`presence`) tracking online status and last-seen timestamps.
5. **Native Mobile Shells:**
   - **Android:** Custom Java bridge (`MainActivity.java`), background services (`OSAFirebaseMessagingService`, `OSACallNotificationService`, `OSAVoiceNotificationService`), and package updater (`OSAUpdateManager.java`).
   - **iOS:** Capacitor with Swift CallKit & APNs handlers (`OSACallKitManager.swift`, `OSANativeNotificationHandler.swift`).
   - **PWA:** Service Worker (`public/service-worker.js`) with Web Push VAPID and install prompts.

### C. Backend & Database
- **Supabase PostgreSQL Schema (`supabase/schema.sql`):** 20+ tables with Row Level Security (RLS) enabled on all tables (`profiles`, `chats`, `chat_members`, `messages`, `calls`, `push_subscriptions`, `user_devices`, `admin_users`, etc.).
- **Edge Functions (`supabase/functions/`):**
  - `send-web-push`: Multi-device Web Push and FCM delivery.
  - `translate-message`: Google Translate integration for real-time message translation.
  - `delete-account`: GDPR-compliant user data erasure.

---

## 4. Affiliate Income Readiness Checklist

| Component | Status | Details |
| :--- | :---: | :--- |
| **Affiliate Partner / Feed Integration** | ❌ **Missing** | No Amazon, Daraz, ShareASale, CJ, or custom affiliate feeds connected. |
| **Product Catalog & Schema** | ❌ **Missing** | No database tables for products, categories, merchant feeds, or pricing. |
| **Affiliate Link Redirection & Cloaking** | ❌ **Missing** | No link shortener/redirect handler (e.g. `/go/:id`) or UTM campaign tagger. |
| **Click & Impression Tracking** | ❌ **Missing** | No analytics or database logging for outgoing clicks, user sessions, or bounce rates. |
| **Conversion & Commission Ledger** | ❌ **Missing** | No webhook endpoints or reconciliation system to track sales, pending vs approved payouts. |
| **AI Product Recommendation Engine** | ❌ **Missing** | No AI model or pipeline to match user intent/chat topics to relevant affiliate products. |
| **Affiliate Chat UI / Deal Cards** | ❌ **Missing** | Chat interface currently only renders standard text/media; no interactive product or coupon cards. |
| **Premium Subscriptions & Payments** | ❌ **Missing** | No billing gateway (Stripe, bKash, etc.) configured. |
| **Revenue Analytics & Reporting** | ❌ **Missing** | No dashboard for the app owner to inspect earnings, top products, or conversion rates. |

---

## 5. AI Automation Readiness Checklist

| Component | Status | Details |
| :--- | :---: | :--- |
| **Google GenAI SDK Installed** | ✅ **Verified** | `@google/genai` is installed in `package.json` (`v2.4.0`). |
| **Interactive Chat AI** | ⚠️ **Partial** | Gemini 2.5 Flash is wired for drafting replies (`aiService.ts`), but has no knowledge of products or monetization. |
| **Background Cron / Schedulers** | ❌ **Missing** | No scheduled jobs (pg_cron, GitHub Actions cron, or serverless cron) to refresh product feeds or scrape prices. |
| **Autonomous Agent Loop** | ❌ **Missing** | No autonomous loop or tool-calling agent to search, validate, and suggest deals. |
| **Automated Error Recovery & Alerting** | ❌ **Missing** | Edge functions only log errors to Supabase console; no alert webhook (Slack, Telegram, or Email). |

---

## 6. Security & Privacy Findings

1. **Zero Secret Leaks:** `.env.example`, `package.json`, `supabase/config.toml`, and all client files were verified. No API keys, passwords, or Supabase `service_role` keys are committed or exposed.
2. **Client-Side API Key Architecture:** `VITE_GOOGLE_AI_API_KEY` is embedded in the client build via Vite. For autonomous affiliate operations, commercial LLM calls should migrate to a Supabase Edge Function to protect API quota and keys from client scraping.
3. **User Privacy Boundaries:** To maintain user trust and avoid app store rejections, AI product suggestions must **never** harvest private end-to-end user chats for external advertising networks. Any product discovery must be user-requested (e.g., an opt-in "OSA Deals / Shopping Assistant", dedicated bot, or explicit keyword queries).
4. **FTC / Consumer Disclosure Compliance:** All affiliate links and recommendation cards must display an "Ad" / "Sponsored" / "Affiliate Link" disclosure in compliance with international advertising standards.

---

## 7. Missing Integrations, Credentials & Permissions

1. **Affiliate Networks:**
   - Need merchant affiliate IDs / API keys (e.g., Amazon Associates, Daraz Affiliate, ClickBank, Impact, or Awin).
2. **Database Migrations Required:**
   - `affiliate_merchants` (merchant configurations)
   - `affiliate_products` (catalog, images, prices, target affiliate links)
   - `affiliate_clicks` (timestamp, click token, user ID if logged in, device, referrer)
   - `affiliate_conversions` (sale amount, commission rate, status: `pending`/`approved`/`rejected`)
   - `ai_recommendation_logs` (AI suggestions matched vs clicked)
3. **Serverless Infrastructure:**
   - Need a Supabase Edge Function (e.g., `affiliate-redirect` and `affiliate-assistant`) to handle clean URL routing and hide raw affiliate parameters.

---

## 8. Potential Costs & Free-Tier Options

| Service | Free-Tier Scope | Paid / Scaling Cost | Recommendation |
| :--- | :--- | :--- | :--- |
| **Supabase Database & Edge Functions** | 500MB database, 50,000 monthly active users, 500K Edge Function invocations (Free Tier). | $25/mo (Pro Tier) | **Start on existing Free/Developer tier.** Storage and database load for affiliate catalog is minimal (<10MB). |
| **Google Gemini API (@google/genai)** | Free rate-limited tier (15 RPM for Gemini 1.5/2.5 Flash). | Pay-per-token ($0.075 / 1M input tokens on Flash). | **Use free tier during development and testing.** |
| **GitHub Pages & Actions** | Unlimited static hosting on custom domain `osa-chat.com`; 2,000 free Actions CI minutes/mo. | Free for public/standard repos. | **$0 operational cost.** |
| **Affiliate Partner APIs** | Most networks (Amazon Associates, Impact, CJ) are **100% free** to join and earn from. | Networks take a percentage of the merchant fee, not the publisher. | **Free to enroll.** |

---

## 9. Implementation Roadmap & Priorities

```
[Priority 1: Core Affiliate Foundations]
  ├── Task 2: Database Schema & Migration (Products, Merchants, Clicks, Conversions)
  ├── Task 3: Secure Click-Tracking & Redirect Edge Function (/go/:productId)
  └── Task 4: In-App Product Showcase & Deal Cards UI (Bilingual, Dark/Light mode)

[Priority 2: AI Automation & Monetization Engine]
  ├── Task 5: AI Shopping & Deals Assistant Engine (Intent detection & product matching)
  ├── Task 6: Autonomous Product Feed Ingestion & Price Verification (Scheduled job)
  └── Task 7: Smart In-Chat Product Sharing (Users can share verified affiliate deals)

[Priority 3: Analytics, Subscriptions & Scaling]
  ├── Task 8: Owner Affiliate Analytics Dashboard (Clicks, Earnings, CTR, Top Categories)
  └── Task 9: OSA Premium Subscription & Family Entitlements (Future monetization)
```

---

## 10. Next Tasks: Acceptance Criteria & Tests

### Task 2: Affiliate Data Model & Migration
- **Criteria:** Create idempotent migration creating `affiliate_merchants`, `affiliate_products`, `affiliate_clicks`, and `affiliate_conversions` with strict RLS policies (public can view active products; only system/admin can view click IP logs and financial conversions).
- **Test:** Verify migration runs cleanly in PostgreSQL, RLS denies unauthorized writes, and product queries execute in <20ms.

### Task 3: Secure Click Tracking & Redirect Engine
- **Criteria:** Implement Supabase Edge Function `/api/track-click` or client redirect component that generates a unique tracking token, logs the click asynchronously, and forwards the browser to the destination with proper affiliate affiliate tags.
- **Test:** Automated test simulating 10 concurrent clicks; verify database records increment without exposing affiliate token credentials.

---

## 11. Recommended Next Task

**Proceed to Task 2: Database Schema & Core Affiliate Tracking Foundation.**  
Define the PostgreSQL tables for products, affiliate networks, and secure click tracking so the application has an authorized data layer ready for products and AI recommendations.

---

## 12. Final Safety Confirmation

- **No existing code files modified:** All core messaging, WebRTC calling, FCM, and native update systems remain 100% intact.
- **No Git commits or pushes made:** Local working tree remains unaltered.
- **No production settings or external credentials altered.**
- **Stopping here as instructed, awaiting project owner's approval and next directive.**
