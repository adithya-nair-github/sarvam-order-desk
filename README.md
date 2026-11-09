# Namma Order Desk

A standalone, mobile-first voice-order prototype. The browser records a short order and posts it to the local Node server. Saaras v4 produces both a source-language transcript and an English translation; Sarvam-105B normalizes the translation into schema-validated English JSON, and Sarvam-105B Conversations asks for missing required details. Bulbul v4 Flash speaks the clarification where supported. Credit details are fixed demo data and appear only when the order asks about pending credit.

## Run locally

Requires Node.js 20.6 or newer. From this folder:

```powershell
Copy-Item .env.example .env
```

Sarvam provides the APIs, but this app needs your own API subscription key to authenticate and bill model requests. Create an account in the [Sarvam dashboard](https://indus.sarvam.ai/), create/copy an API key, and put it in `.env` as `SARVAM_API_KEY=...`. Then run:

```powershell
npm run start:env
```

Open <http://localhost:4173>. The API key is read by `server.mjs` and is never sent to browser code. Alternatively, set `SARVAM_API_KEY` in the server process environment and run `npm start`.

Microphone recording requires localhost or HTTPS and browser permission. The app records up to 28 seconds. The selector supports all 22 Indic Saaras languages plus Indian English, with auto-detect. Each recording makes one Saaras `transcribe` request and one `translate` request so the source transcript and English bridge are both visible; this means two STT charges per audio minute, plus chat and optional TTS usage. Current pay-as-you-go STT rates and credits are listed in [Sarvam pricing docs](https://docs.sarvam.ai/api/getting-started/pricing).

Saaras supports all 23 transcription languages, but Bulbul TTS currently lists 10 Indic languages plus English. Clarifications for other languages are returned in English. Sarvam-105B's chat model is documented for 10 most-spoken Indian languages plus English; the order extraction prompt receives the Saaras English translation so the ERP JSON stays English.

The API key is only read by the server and is never sent to browser code. Sarvam requires it in the `api-subscription-key` header for Saaras, chat completions, and Bulbul.

## Order shape

```json
{
  "items": [
    { "product": "Wheat flour", "quantity": 5, "unit": "bag" }
  ],
  "delivery_location": "Hubballi",
  "delivery_date": "2026-11-10",
  "asked_about_pending_credit": true
}
```

The model merges follow-up turns into the draft and keeps missing values explicit. It does not submit the order to an ERP. The demo catalog currently contains wheat flour, iodized salt, leaf tea and cooking oil. The credit response uses a fictional balance of ₹18,450 due on 15 November 2026.

## Roadmap

The page shows three planned enterprise workflows beyond order capture:

- Non-delivery resolution: call the driver or shop, capture the reason, then reschedule only after the receiver confirms.
- Carrier capacity and ETS: confirm load capacity and estimated shipment timing; route price commitments for approval.
- Invoice follow-up: remind distributors about pending invoices, record promises to pay, and route disputes to a person.

These are roadmap concepts, not active outbound-call integrations. Production calling would also need telephony, approved scripts, consent controls, human escalation, and confirmed ERP actions.

## Phase 02 demo: non-delivery resolution

The dashboard includes an "Active deliveries / exception queue" section driven by two local routes:

- `GET /api/deliveries` lists the demo delivery ledger. On first run the server seeds `orders_ledger.json` with five mock orders in various states (Pending, Out for Delivery, exception, Delivered).
- `POST /api/orders/resolve-ndr` accepts JSON `{ "order_id": "ORD-1043", "status": "Delivery Failed - Shop Closed" | "Refused - Quantity Mismatch" }`. It generates a scripted voice-agent dispatch log (agent lines to the driver and receiver, with the receiver confirming before anything is rescheduled), flips the order to `Rescheduled` with a new delivery date, and persists the change to `orders_ledger.json`.

The dispatch log is a deterministic mock generator, not a live Sarvam call, so the demo works offline and costs nothing. Quantity-mismatch disputes set `requires_human_follow_up` and show a "Needs human review" chip. The ledger is demo data only, is gitignored, and is not served as a static file.

## Phase 03 demo: carrier capacity and ETS

Below the exception queue, a "Carrier & logistics dispatch" board covers pending orders:

- `GET /api/carriers` lists the fictional carrier registry in `carriers.mjs` (vehicle, capacity, base rate).
- `POST /api/carriers/dispatch-load` accepts `{ "order_id": "ORD-1041", "carrier_id": "carrier-anjaneya" }` for an order in `Pending` status. It simulates the automated outbound call: the agent requests the vehicle for the load, pickup window and offered rate; the simulated carrier confirms capacity, counters, or declines. Outcomes are deterministic per order+carrier pair.

Confirmed-capacity calls set an ETS (pickup window plus delivery timing based on route distance) and move the order to `Dispatch Scheduled`. Rejections and counter-offers keep the order `Pending`, with each attempt appended to `carrier_dispatches` in the ledger. In every case the price is recorded with `price_status: "recorded for human approval"` — the agent never commits a rate on the call, per the roadmap rule that price commitments require approval. All calls are simulated and labelled as such in the transcript.

## Phase 04 demo: invoice follow-up

A "Financial ledger & collections" panel lists seeded distributor credit accounts with aging buckets, credit-limit usage bars and outstanding balances:

- `GET /api/finance/accounts` lists the demo accounts from `finance.mjs` with server-computed `aging_days`.
- `POST /api/finance/invoice-reminder` accepts `{ "account_id": "ACC-2001" }`. It simulates the automated collections call and records one of three outcomes, appended to `collections` in the ledger:
  - **Promise to Pay** — logs a specific promise date on the account (deterministic: five days ahead in the demo).
  - **Dispute** — marks `dispute_open: true` and stops further automated calls until a person resolves it.
  - **Paid** — logs the payment claim and blocks further calls until the payment is verified; a reported payment is never credited automatically.

The demo credit balances are fictional and independent of the `credit_info` note shown in the voice-order flow. No money movement, invoice mutation, or credit-limit change happens automatically.

## Tabbed dashboard and Phase 05 demo: auto-generated invoices

The dashboard is a five-tab console: 01 Order Desk, 02 Non-Delivery Resolution, 03 Carrier Dispatch & ETS, 04 Invoice Follow-up, 05 Auto-Generated Invoices. Tabs switch views instantly client-side; no state is re-fetched on tab change.

When a voice-order draft completes (no missing fields and the previous draft was not already complete), the turn route automatically generates a proforma invoice and persists it to the `invoices` array in `orders_ledger.json`:

- Invoice IDs follow `INV-YYYYMMDD-NNN`, growing with the ledger sequence.
- Each invoice carries a timestamp, itemized products with rates and amounts, a total value, `credit_terms: "Net 7 Days"` and a due date seven days out.
- Catalog products are priced from the demo rate card in `invoices.mjs`. Products outside the rate card are marked "Rate missing" and the invoice status becomes `Draft - pricing pending` — prices are never invented.
- Fully priced invoices carry the `To Be Paid` status badge and are viewable and printable (per-card print button) in tab 05.

Invoices are simulated proforma documents, not legal invoices; the ledger only seeds one demo invoice alongside the other demo state.

## Checks

```powershell
npm test
```

The API route is `POST /api/orders/turn` (multipart fields `audio`, `language`, and optional `current_order`). Sarvam credentials stay on the server in the `api-subscription-key` request header.

## Deploy on Vercel

Import this repo in Vercel (framework preset: Other, no build command). Add the environment variable `SARVAM_API_KEY` under Project Settings, then deploy. `public/` is served as static files and `api/index.js` runs the server routes as one serverless function. On Vercel the demo ledger lives in `/tmp`, so orders, invoices and call logs reset when the function restarts.

## What a completed voice order creates

When the order draft has no missing fields, the server saves one record set to the ledger: an order (ORD-xxxx, source "voice order"), a proforma invoice linked to it, a simulated transport request to the cheapest carrier that fits the estimated load, and a balance update on the customer account (ACC-2001). Tabs 02 to 05 read the same ledger, so the order shows up in each of them.

## Keeping data on Vercel

Without a database, Vercel keeps the ledger in temporary storage that resets. For durable storage, add an Upstash Redis database from the Vercel Storage tab and connect it to the project. The app picks up `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` names) automatically. `/api/health` reports `storage` as `durable`, `temporary` or `local file`.
