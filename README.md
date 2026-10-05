# OSA — Complete Real-Time Messaging, Status, Groups & WebRTC Calling Application

**OSA** is a complete, production-ready, mobile-first progressive web messaging application built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **Supabase** (Auth, PostgreSQL, Realtime, Storage), and **WebRTC**.

---

## 1. Project Setup

Clone the repository and navigate into the project directory:

```bash
git clone <your-github-repo-url> osa
cd osa
```

---

## 2. `npm install`

Install all project dependencies:

```bash
npm install
```

---

## 3. Supabase Project Creation

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New Project**, choose your organization, name the project **OSA**, set a strong database password, and select your closest region.
3. Wait for the PostgreSQL database and API services to finish provisioning.

---

## 4. Supabase SQL Installation

1. In your Supabase Dashboard, open the **SQL Editor**.
2. Click **New Query**.
3. Copy the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and paste it into the editor.
4. Click **Run** to create:
   - All 17 tables (`profiles`, `privacy_settings`, `chats`, `chat_members`, `messages`, `message_attachments`, `groups`, `group_members`, `statuses`, `status_views`, `blocks`, `reports`, `calls`, `call_signals`, `notifications`, `support_tickets`, `push_subscriptions`)
   - UUID primary keys, foreign keys, `created_at` / `updated_at` triggers, indexes, and constraints
   - RPC functions (`get_or_create_direct_chat`, `create_group_with_chat`, `mark_chat_messages_read`, `delete_message_for_me`, `delete_own_account`)
   - Row Level Security (RLS) policies on all tables
   - Storage buckets and policies
   - `supabase_realtime` publication configuration

---

## 5. Storage Bucket Setup

Running `supabase/schema.sql` automatically creates and configures three public buckets with authenticated upload/delete RLS policies:

- `osa-avatars` (10 MB limit — profile & group photos)
- `osa-media` (50 MB limit — chat images, videos, audio & documents)
- `osa-statuses` (30 MB limit — 24-hour image & video status updates)

You can verify these buckets under **Storage** in the Supabase Dashboard.

---

## 6. Authentication Configuration

1. Open **Authentication** &rarr; **Providers** in your Supabase Dashboard.
2. Ensure **Email** provider is enabled.
3. Configure **Confirm email** according to your preference (OSA supports both immediate session login and email confirmation workflows).
4. Under **Authentication** &rarr; **URL Configuration**, set:
   - **Site URL**: Your production or local URL (e.g., `http://localhost:3000` or `https://your-domain.com`)
   - **Redirect URLs**: Add `http://localhost:3000/?reset_password=true` and `https://your-domain.com/?reset_password=true` for password recovery links.

---

## 7. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your public Supabase credentials from **Project Settings** &rarr; **API**:

```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-public-anon-key"

# Optional WebRTC STUN / TURN Public Configuration
VITE_WEBRTC_STUN_URLS="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
VITE_WEBRTC_TURN_URL=""
VITE_WEBRTC_TURN_USERNAME=""
VITE_WEBRTC_TURN_CREDENTIAL=""

# Optional Web Push Public VAPID Key
VITE_VAPID_PUBLIC_KEY=""
```

You can also configure or update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` directly in the OSA UI via the **Connect Supabase** modal.

---

## 8. Local Development

Start the development server on port `3000`:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 9. Production Build

Type-check and build the optimized production bundle:

```bash
npm run lint
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 10. GitHub Deployment

1. Commit all files (excluding `.env` and `node_modules`, which are ignored via `.gitignore`).
2. Push to your GitHub repository:
   ```bash
   git add .
   git commit -m "Initial release of OSA real-time messaging app"
   git push origin main
   ```
3. Connect the repository to Vercel, Netlify, Cloudflare Pages, or Cloud Run and configure the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 11. PWA Deployment

OSA includes full Progressive Web App support:
- `public/manifest.webmanifest` with `name: "OSA"` and `short_name: "OSA"`
- `public/service-worker.js` and Workbox precaching via `vite-plugin-pwa`
- `public/offline.html` offline fallback page
- Standard 192x192, 512x512, maskable, and Apple Touch icons
- In-app **Install OSA** prompt for Android, Desktop Chromium, and iOS Safari

---

## 12. HTTPS Requirement

Both **Service Workers (PWA)** and **WebRTC (`navigator.mediaDevices.getUserMedia`)** require a secure context (**HTTPS**) in production. (`http://localhost` is permitted during local development). Always deploy OSA behind HTTPS.

---

## 13. WebRTC Configuration

OSA uses native browser `RTCPeerConnection` and `getUserMedia` for real peer-to-peer audio and video calling, paired with Supabase Realtime (`calls` and `call_signals` tables) for SDP offer/answer exchange and ICE candidate trickle.

---

## 14. TURN Configuration

For users behind symmetric NATs or strict firewalls, configure a TURN relay server using environment variables:

```env
VITE_WEBRTC_TURN_URL="turn:your-turn-server.com:3478"
VITE_WEBRTC_TURN_USERNAME="public-or-ephemeral-username"
VITE_WEBRTC_TURN_CREDENTIAL="public-or-ephemeral-credential"
```

Never place long-lived master TURN server secrets in frontend environment variables; generate ephemeral credentials or use public/scoped TURN credentials.

---

## 15. Push Notification Configuration

OSA supports real-time in-app notifications via Supabase Realtime (`notifications` table) and browser push notifications via the Web Notification & Service Worker Push APIs (`public/service-worker.js`). Users can grant browser notification permissions inside **Notifications** or **Settings &rarr; Notifications**.

---

## 16. Security Requirements

- **Never expose the Supabase `service_role` key** in `.env` or frontend code. Use only the public `anon` key (`VITE_SUPABASE_ANON_KEY`).
- All database access is protected by PostgreSQL **Row Level Security (RLS)** defined in `supabase/schema.sql`.
- Account deletion is executed safely on the server via the `public.delete_own_account()` SECURITY DEFINER RPC function or the optional [`supabase/functions/delete-account/index.ts`](./supabase/functions/delete-account/index.ts) Edge Function.
