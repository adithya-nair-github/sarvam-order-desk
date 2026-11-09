import { AUTO_LANGUAGE, SARVAM_LANGUAGES } from "./languages.js";

const recordButton = document.querySelector("#record-button");
const recordStatus = document.querySelector("#record-status");
const connectionState = document.querySelector("#connection-state");
const connectionLabel = document.querySelector("#connection-label");
const languageSelect = document.querySelector("#language-select");
const chatLog = document.querySelector("#chat-log");
const draftEmpty = document.querySelector("#draft-empty");
const draftBlocks = document.querySelector("#draft-blocks");
const itemList = document.querySelector("#item-list");
const deliveryLocation = document.querySelector("#delivery-location");
const deliveryDate = document.querySelector("#delivery-date");
const creditNote = document.querySelector("#credit-note");
const orderJson = document.querySelector("#order-json");
const newOrderButton = document.querySelector("#new-order-button");
let selectedLanguage = AUTO_LANGUAGE;
let recorder;
let mediaStream;
let audioChunks = [];
let recordingStartedAt = 0;
let recordingTimer;
let currentOrder = null;
const replyAudioUrls = [];

const languageNames = Object.fromEntries(SARVAM_LANGUAGES.map(({ code, name }) => [code, name]));
for (const language of SARVAM_LANGUAGES) {
  const option = document.createElement("option");
  option.value = language.code;
  option.textContent = `${language.name} (${language.nativeName})`;
  languageSelect.append(option);
}
languageSelect.addEventListener("change", () => {
  selectedLanguage = languageSelect.value;
});

async function checkServer() {
  try {
    const response = await fetch("/api/health");
    const status = await response.json();
    if (status.sarvam_configured) {
      connectionState.classList.add("is-ready");
      connectionLabel.textContent = "API key configured";
    } else {
      connectionState.classList.add("is-error");
      connectionLabel.textContent = "API key needed";
    }
  } catch {
    connectionState.classList.add("is-error");
    connectionLabel.textContent = "Server unavailable";
  }
}

function setButtonState(state) {
  recordButton.classList.toggle("is-recording", state === "recording");
  recordButton.classList.toggle("is-processing", state === "processing");
  recordButton.disabled = state === "processing";
  recordButton.setAttribute("aria-label", state === "recording" ? "Stop recording" : "Start recording");
  if (state === "recording") recordStatus.textContent = "Listening… tap to finish";
  if (state === "processing") recordStatus.textContent = "Transcribing and standardizing…";
}

function elapsedLabel() {
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  return `Listening · 00:${String(seconds).padStart(2, "0")}`;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    recordStatus.textContent = "Recording is not supported in this browser.";
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      mediaStream?.getTracks().forEach((track) => track.stop());
      mediaStream = null;
      const audio = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
      if (audio.size === 0) {
        setButtonState("idle");
        recordStatus.textContent = "No audio captured. Try again.";
        return;
      }
      sendAudio(audio);
    }, { once: true });
    recorder.start(250);
    recordingStartedAt = Date.now();
    setButtonState("recording");
    recordStatus.textContent = elapsedLabel();
    recordingTimer = window.setInterval(() => {
      recordStatus.textContent = elapsedLabel();
      if (Date.now() - recordingStartedAt >= 28000) stopRecording();
    }, 250);
  } catch (error) {
    recordStatus.textContent = error.name === "NotAllowedError" ? "Allow microphone access to record." : "Could not start the microphone.";
  }
}

function stopRecording() {
  window.clearInterval(recordingTimer);
  if (recorder?.state === "recording") {
    setButtonState("processing");
    recorder.stop();
  }
}

async function sendAudio(audio) {
  setButtonState("processing");
  const form = new FormData();
  const extension = audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `order.${extension}`);
  form.append("language", selectedLanguage);
  if (currentOrder) form.append("current_order", JSON.stringify(currentOrder));

  try {
    const response = await fetch("/api/orders/turn", { method: "POST", body: form });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) throw new Error(payload?.error || `The order turn failed with HTTP ${response.status}.`);
    handleTurn(payload);
    recordStatus.textContent = payload.follow_up_question ? "One more detail needed" : "Order draft ready for ERP review";
  } catch (error) {
    recordStatus.textContent = error.message;
  } finally {
    setButtonState("idle");
  }
}

function clearReplyAudio() {
  while (replyAudioUrls.length) URL.revokeObjectURL(replyAudioUrls.pop());
}

function dateLabel(isoDate) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendToChat(node) {
  document.querySelector("#chat-empty")?.remove();
  chatLog.append(node);
  scrollChatToBottom();
}

function appendDistributorTurn(payload) {
  const turn = document.createElement("li");
  turn.className = "turn distributor";

  const head = document.createElement("div");
  head.className = "turn-head";
  const who = document.createElement("span");
  who.className = "turn-who";
  who.textContent = "You";
  head.append(who);
  const languageName = languageNames[payload.language_code];
  if (languageName) {
    const chip = document.createElement("span");
    chip.className = "turn-lang";
    chip.textContent = languageName;
    head.append(chip);
  }

  const original = document.createElement("p");
  original.className = "turn-original";
  original.textContent = payload.transcript;

  const bridgeLabel = document.createElement("p");
  bridgeLabel.className = "turn-bridge-label";
  bridgeLabel.textContent = "SAID IN ENGLISH";

  const bridge = document.createElement("p");
  bridge.className = "turn-bridge";
  bridge.textContent = payload.english_transcript || "Translation not available";

  turn.append(head, original, bridgeLabel, bridge);
  appendToChat(turn);
}

function appendNote(text) {
  const turn = document.createElement("li");
  turn.className = "turn note";
  turn.textContent = text;
  appendToChat(turn);
}

function createReplyAudio(base64) {
  const audio = document.createElement("audio");
  audio.className = "agent-audio";
  audio.controls = true;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  replyAudioUrls.push(url);
  audio.src = url;
  return audio;
}

function appendAgentTurn({ question, audio, hint }) {
  const turn = document.createElement("li");
  turn.className = "turn agent";

  const head = document.createElement("div");
  head.className = "turn-head";
  const who = document.createElement("span");
  who.className = "turn-who";
  who.textContent = "Order desk";
  head.append(who);

  const text = document.createElement("p");
  text.className = "agent-question";
  text.textContent = question;
  turn.append(head, text);
  if (audio) turn.append(audio);
  if (hint) {
    const hintParagraph = document.createElement("p");
    hintParagraph.className = "agent-hint";
    hintParagraph.textContent = hint;
    turn.append(hintParagraph);
  }
  appendToChat(turn);
  if (audio) audio.play().catch(() => {});
}

function renderDraft(order, creditInfo) {
  currentOrder = order;
  draftEmpty.hidden = true;
  draftBlocks.hidden = false;

  orderJson.textContent = JSON.stringify(order, null, 2);
  itemList.replaceChildren();
  if (order.items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-items";
    empty.textContent = "No items captured yet";
    itemList.append(empty);
  } else {
    order.items.forEach((item) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      const quantity = document.createElement("span");
      name.className = "item-name";
      quantity.className = "item-quantity";
      name.textContent = item.product;
      quantity.textContent = item.quantity === null ? `Quantity unclear · ${item.unit}` : `${item.quantity} ${item.unit}`;
      row.append(name, quantity);
      itemList.append(row);
    });
  }

  deliveryLocation.textContent = order.delivery_location || "Not recognized";
  deliveryDate.textContent = order.delivery_date ? dateLabel(order.delivery_date) : "Not mentioned";

  creditNote.hidden = !creditInfo;
  if (creditInfo) {
    creditNote.textContent = `Pending credit asked about · Demo balance ₹${creditInfo.outstanding_amount_inr.toLocaleString("en-IN")} due ${creditInfo.due_date}.`;
  }
}

function handleTurn(payload) {
  appendDistributorTurn(payload);
  payload.warnings.forEach((warning) => appendNote(warning));
  renderDraft(payload.order, payload.credit_info);
  if (payload.follow_up_question) {
    const audio = payload.reply_audio_base64 ? createReplyAudio(payload.reply_audio_base64) : null;
    appendAgentTurn({
      question: payload.follow_up_question,
      audio,
      hint: audio ? "Record your answer to continue the draft." : "Text clarification only. Record your answer to continue."
    });
  } else {
    appendAgentTurn({ question: "Order draft is complete and ready for ERP review." });
  }
  if (payload.invoice) {
    appendNote(`Proforma invoice ${payload.invoice.invoice_id} generated automatically — see tab 05 / Auto-Generated Invoices.`);
    loadInvoices();
  }
}

function chatEmptyNode() {
  const empty = document.createElement("li");
  empty.className = "chat-empty";
  empty.id = "chat-empty";
  empty.textContent = "No turns yet. Tap record and start speaking.";
  return empty;
}

function resetSession() {
  const playing = chatLog.querySelector("audio");
  playing?.pause();
  clearReplyAudio();
  currentOrder = null;
  chatLog.replaceChildren(chatEmptyNode());
  draftEmpty.hidden = false;
  draftBlocks.hidden = true;
  recordStatus.textContent = "Tap to record";
  recordButton.focus();
}

recordButton.addEventListener("click", () => {
  if (recorder?.state === "recording") stopRecording();
  else startRecording();
});

newOrderButton.addEventListener("click", resetSession);

const NDR_EXCEPTION_STATUSES = new Set(["Delivery Failed - Shop Closed", "Refused - Quantity Mismatch"]);
const STATUS_TAG_CLASSES = new Map([
  ["Pending", "is-pending"],
  ["Out for Delivery", "is-out"],
  ["Delivered", "is-delivered"],
  ["Rescheduled", "is-rescheduled"],
  ["Dispatch Scheduled", "is-dispatched"]
]);
const deliveryList = document.querySelector("#delivery-list");
const carrierListBoard = document.querySelector("#carrier-list");
let deliveries = [];
let carriers = [];
let deliveriesLoaded = false;
let carriersLoaded = false;

function statusTagClass(status) {
  return NDR_EXCEPTION_STATUSES.has(status) ? "is-exception" : STATUS_TAG_CLASSES.get(status) || "is-pending";
}

function itemsSummary(items) {
  return items.map(({ quantity, unit, product }) => `${quantity} ${unit} ${product}`).join(" + ");
}

function buildCallLog(resolution) {
  const log = document.createElement("ol");
  log.className = "call-log";
  for (const line of resolution.transcript) log.append(buildCallLine(line));
  return log;
}

function buildCallLine(line) {
  const row = document.createElement("li");
  row.className = line.speaker.startsWith("agent") ? "call-line is-agent" : "call-line";
  const speaker = document.createElement("span");
  speaker.className = "call-speaker";
  speaker.textContent = line.speaker;
  const text = document.createElement("span");
  text.textContent = line.text;
  row.append(speaker, text);
  return row;
}

function deliveryCard(delivery) {
  const card = document.createElement("li");
  card.className = "delivery-card";
  card.dataset.orderId = delivery.order_id;

  const head = document.createElement("div");
  head.className = "delivery-head";
  const id = document.createElement("span");
  id.className = "delivery-id";
  id.textContent = delivery.order_id;
  const tag = document.createElement("span");
  tag.className = `status-tag ${statusTagClass(delivery.status)}`;
  tag.textContent = delivery.status;
  head.append(id, tag);

  const meta = document.createElement("p");
  meta.className = "delivery-meta";
  meta.textContent = `${delivery.distributor} · ${delivery.delivery_location} · ${itemsSummary(delivery.items)}`;

  const schedule = document.createElement("p");
  schedule.className = "delivery-scheduled";
  schedule.textContent = `Scheduled: ${dateLabel(delivery.scheduled_delivery_date)}`;

  card.append(head, meta, schedule);

  if (delivery.resolution) {
    card.append(buildCallLog(delivery.resolution));
    if (delivery.resolution.requires_human_follow_up) card.append(reviewChip());
  } else if (NDR_EXCEPTION_STATUSES.has(delivery.status)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "resolve-button";
    button.textContent = "Trigger AI resolution call";
    button.addEventListener("click", () => triggerResolutionCall(card, button, delivery.order_id, delivery.status));
    card.append(button);
  }
  return card;
}

function reviewChip() {
  const chip = document.createElement("span");
  chip.className = "review-chip";
  chip.textContent = "Needs human review";
  return chip;
}

function renderDeliveryQueue() {
  deliveryList.replaceChildren(...deliveries.map(deliveryCard));
}

const replayDelay = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 650;

async function triggerResolutionCall(card, button, orderId, status) {
  button.disabled = true;
  button.textContent = "Calling…";
  const callLog = document.createElement("ol");
  callLog.className = "call-log";
  card.append(callLog);
  try {
    const response = await fetch("/api/orders/resolve-ndr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, status })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `The resolution call failed with HTTP ${response.status}.`);
    for (const line of payload.order.resolution.transcript) {
      if (replayDelay) await new Promise((resolve) => window.setTimeout(resolve, replayDelay));
      callLog.append(buildCallLine(line));
    }
    applyResolution(card, payload.order);
    const index = deliveries.findIndex((entry) => entry.order_id === orderId);
    if (index >= 0) deliveries[index] = payload.order;
  } catch (error) {
    callLog.remove();
    const note = document.createElement("p");
    note.className = "delivery-error";
    note.textContent = error.message;
    card.append(note);
    button.disabled = false;
    button.textContent = "Trigger AI resolution call";
  }
}

function applyResolution(card, order) {
  card.querySelector(".resolve-button")?.remove();
  const tag = card.querySelector(".status-tag");
  tag.textContent = order.status;
  tag.className = `status-tag ${statusTagClass(order.status)}`;
  card.querySelector(".delivery-scheduled").textContent = `Scheduled: ${dateLabel(order.scheduled_delivery_date)}`;
  if (order.resolution?.requires_human_follow_up) card.append(reviewChip());
}

async function loadDeliveries() {
  try {
    const response = await fetch("/api/deliveries");
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    deliveries = payload.deliveries;
    renderDeliveryQueue();
    deliveriesLoaded = true;
    refreshCarrierBoard();
  } catch {
    const note = document.createElement("li");
    note.className = "delivery-error";
    note.textContent = "Active deliveries are unavailable right now.";
    deliveryList.replaceChildren(note);
    carrierBoardEmptyNote("The dispatch board is unavailable right now.");
  }
}

const OUTCOME_TAG_CLASSES = new Map([
  ["Confirmed", "is-confirmed"],
  ["Counter-offer", "is-counter"],
  ["Rejected", "is-rejected"]
]);

function negotiationRow(dispatch) {
  const row = document.createElement("li");
  row.className = "negotiation-row";
  const line1 = document.createElement("span");
  line1.className = "negotiation-carrier";
  line1.textContent = `${dispatch.carrier.name} · ${dispatch.carrier.vehicle}`;
  row.append(line1);

  const line2 = document.createElement("span");
  line2.className = "negotiation-outcome";
  const chip = document.createElement("span");
  chip.className = `status-tag ${OUTCOME_TAG_CLASSES.get(dispatch.outcome)}`;
  chip.textContent = dispatch.outcome;
  line2.append(chip);
  if (dispatch.pricing) {
    const price = document.createElement("span");
    price.className = "negotiation-price";
    price.textContent = `₹${dispatch.pricing.carrier_rate_inr_per_km}/km · est ₹${dispatch.pricing.estimated_price_inr.toLocaleString("en-IN")} · ${dispatch.pricing.price_status}`;
    line2.append(price);
  } else {
    const text = document.createElement("span");
    text.className = "negotiation-price";
    text.textContent = "No vehicle available in the pickup window.";
    line2.append(text);
  }
  row.append(line2);

  if (dispatch.ets) {
    const ets = document.createElement("span");
    ets.className = "negotiation-ets";
    ets.textContent = `ETS: pickup ${dispatch.ets.pickup_date} ${dispatch.ets.pickup_window} → delivery ${dispatch.ets.delivery_date} ${dispatch.ets.delivery_window}`;
    row.append(ets);
  }
  if (dispatch.price_approval_required) {
    const approval = document.createElement("span");
    approval.className = "review-chip";
    approval.textContent = "Price needs approval";
    row.append(approval);
  }
  return row;
}

function carrierBoardEmptyNote(text) {
  const note = document.createElement("li");
  note.className = "delivery-loading";
  note.textContent = text;
  carrierListBoard.replaceChildren(note);
}

function carrierCard(order) {
  const card = document.createElement("li");
  card.className = "carrier-card";
  card.dataset.orderId = order.order_id;

  const head = document.createElement("div");
  head.className = "delivery-head";
  const id = document.createElement("span");
  id.className = "delivery-id";
  id.textContent = order.order_id;
  const tag = document.createElement("span");
  tag.className = `status-tag ${statusTagClass(order.status)}`;
  tag.textContent = order.status;
  head.append(id, tag);

  const meta = document.createElement("p");
  meta.className = "delivery-meta";
  const weight = order.load_weight_kg ? `${order.load_weight_kg} kg load` : "Load weight unknown";
  meta.textContent = `${order.distributor} · ${order.delivery_location} · ${itemsSummary(order.items)} · ${weight}`;

  const negotiations = document.createElement("ol");
  negotiations.className = "negotiation-list";
  for (const dispatch of order.carrier_dispatches ?? []) negotiations.append(negotiationRow(dispatch));

  card.append(head, meta, negotiations);

  if (order.status === "Pending") {
    const controls = document.createElement("div");
    controls.className = "carrier-controls";
    const select = document.createElement("select");
    select.className = "carrier-select";
    select.setAttribute("aria-label", `Carrier for ${order.order_id}`);
    for (const carrier of carriers) {
      const option = document.createElement("option");
      option.value = carrier.id;
      option.textContent = `${carrier.name} — ${carrier.vehicle} (${carrier.capacity_kg} kg, ₹${carrier.base_rate_inr_per_km}/km)`;
      select.append(option);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dispatch-button";
    button.textContent = "Dispatch automated carrier call";
    button.addEventListener("click", () => dispatchCarrierCall(card, button, order.order_id));
    controls.append(select, button);
    card.append(controls);
  }
  return card;
}

function refreshCarrierBoard() {
  if (!deliveriesLoaded || !carriersLoaded) return;
  const pending = deliveries.filter((order) => order.status === "Pending");
  if (pending.length === 0) {
    carrierBoardEmptyNote("No pending orders awaiting carrier dispatch.");
    return;
  }
  carrierListBoard.replaceChildren(...pending.map(carrierCard));
}

async function dispatchCarrierCall(card, button, orderId) {
  const carrierId = card.querySelector(".carrier-select")?.value;
  if (!carrierId) return;
  button.disabled = true;
  button.textContent = "Calling carrier…";
  const callLog = document.createElement("ol");
  callLog.className = "call-log";
  card.append(callLog);
  try {
    const response = await fetch("/api/carriers/dispatch-load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, carrier_id: carrierId })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `The carrier call failed with HTTP ${response.status}.`);
    const dispatch = payload.order.carrier_dispatches.at(-1);
    for (const line of dispatch.transcript) {
      if (replayDelay) await new Promise((resolve) => window.setTimeout(resolve, replayDelay));
      callLog.append(buildCallLine(line));
    }
    applyCarrierDispatch(card, payload.order);
  } catch (error) {
    callLog.remove();
    const note = document.createElement("p");
    note.className = "delivery-error";
    note.textContent = error.message;
    card.append(note);
    button.disabled = false;
    button.textContent = "Dispatch automated carrier call";
  }
}

function applyCarrierDispatch(card, order) {
  const index = deliveries.findIndex((entry) => entry.order_id === order.order_id);
  if (index >= 0) deliveries[index] = order;

  const negotiations = card.querySelector(".negotiation-list");
  const dispatch = order.carrier_dispatches.at(-1);
  if (negotiations && dispatch) negotiations.append(negotiationRow(dispatch));

  const tag = card.querySelector(".status-tag");
  if (tag) {
    tag.textContent = order.status;
    tag.className = `status-tag ${statusTagClass(order.status)}`;
  }

  renderDeliveryQueue();

  if (order.status === "Dispatch Scheduled") {
    card.querySelector(".carrier-controls")?.remove();
  } else {
    const button = card.querySelector(".dispatch-button");
    if (button) {
      button.disabled = false;
      button.textContent = "Dispatch automated carrier call";
    }
  }
}

async function loadCarriers() {
  try {
    const response = await fetch("/api/carriers");
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.carriers)) throw new Error();
    carriers = payload.carriers;
    carriersLoaded = true;
    refreshCarrierBoard();
  } catch {
    carrierBoardEmptyNote("The dispatch board is unavailable right now.");
  }
}

const financeListBoard = document.querySelector("#finance-list");
let accountsData = [];

const COLLECTION_OUTCOME_CLASSES = new Map([
  ["Promise to Pay", "is-dispatched"],
  ["Paid", "is-confirmed"],
  ["Dispute", "is-rejected"]
]);

function agingChip(days) {
  if (days > 60) return { text: "60+ days overdue", className: "is-rejected" };
  if (days > 30) return { text: "31-60 days overdue", className: "is-counter" };
  return { text: `${days} days overdue`, className: "is-pending" };
}

function callChip(text, className) {
  const chip = document.createElement("span");
  chip.className = `status-tag ${className}`;
  chip.textContent = text;
  return chip;
}

function accountFlagChips(account) {
  const flags = [];
  if (account.dispute_open) flags.push(callChip("Disputed — escalated to human review", "is-rejected"));
  if (account.payment_reported_at) flags.push(callChip("Payment reported — awaiting verification", "is-confirmed"));
  if (account.promised_payment_date && !account.dispute_open && !account.payment_reported_at) {
    flags.push(callChip(`Promised by ${dateLabel(account.promised_payment_date)}`, "is-dispatched"));
  }
  return flags;
}

function collectionRow(call) {
  const row = document.createElement("li");
  row.className = "negotiation-row";
  const line1 = document.createElement("span");
  line1.className = "negotiation-carrier";
  line1.textContent = call.call_id;
  row.append(line1);
  const line2 = document.createElement("span");
  line2.className = "negotiation-outcome";
  line2.append(callChip(call.outcome, COLLECTION_OUTCOME_CLASSES.get(call.outcome) || "is-pending"));
  const detail = document.createElement("span");
  detail.className = "negotiation-price";
  if (call.outcome === "Promise to Pay") detail.textContent = `Promises ₹${call.balance_at_call.toLocaleString("en-IN")} by ${dateLabel(call.promise_date)}`;
  else if (call.outcome === "Paid") detail.textContent = `Reports paying ₹${call.balance_at_call.toLocaleString("en-IN")} on ${dateLabel(call.payment_reported_date)} — pending verification`;
  else detail.textContent = `Disputes the balance — needs reconciliation with a person`;
  line2.append(detail);
  row.append(line2);
  return row;
}

function financeCard(account) {
  const card = document.createElement("li");
  card.className = "carrier-card";
  card.dataset.accountId = account.account_id;

  const head = document.createElement("div");
  head.className = "delivery-head";
  const name = document.createElement("span");
  name.className = "delivery-id";
  name.textContent = account.distributor;
  const aging = agingChip(account.aging_days ?? 0);
  head.append(name, callChip(aging.text, aging.className));

  const meta = document.createElement("p");
  meta.className = "delivery-meta";
  meta.textContent = `${account.account_id} · Outstanding ₹${account.outstanding_inr.toLocaleString("en-IN")} of ₹${account.credit_limit_inr.toLocaleString("en-IN")} limit · Invoices ${account.invoice_refs.join(", ")}`;

  const bar = document.createElement("div");
  bar.className = "credit-bar";
  const usage = document.createElement("span");
  usage.style.width = `${Math.min(100, Math.round((account.outstanding_inr / account.credit_limit_inr) * 100))}%`;
  bar.append(usage);

  card.append(head, meta, bar);

  const calls = document.createElement("ol");
  calls.className = "negotiation-list";
  for (const call of account.collections ?? []) calls.append(collectionRow(call));
  card.append(calls);

  const flags = document.createElement("div");
  flags.className = "account-flags";
  for (const chip of accountFlagChips(account)) flags.append(chip);
  card.append(flags);

  if (account.outstanding_inr > 0 && !account.dispute_open && !account.payment_reported_at) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dispatch-button";
    button.textContent = "Trigger Voice Follow-Up";
    button.addEventListener("click", () => triggerCollectionsCall(card, button, account.account_id));
    card.append(button);
  }
  return card;
}

function renderFinanceBoard() {
  if (accountsData.length === 0) {
    const note = document.createElement("li");
    note.className = "delivery-loading";
    note.textContent = "No overdue accounts right now.";
    financeListBoard.replaceChildren(note);
    return;
  }
  financeListBoard.replaceChildren(...accountsData.map(financeCard));
}

async function triggerCollectionsCall(card, button, accountId) {
  button.disabled = true;
  button.textContent = "Calling…";
  const callLog = document.createElement("ol");
  callLog.className = "call-log";
  card.append(callLog);
  try {
    const response = await fetch("/api/finance/invoice-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `The collections call failed with HTTP ${response.status}.`);
    const call = payload.account.collections.at(-1);
    for (const line of call.transcript) {
      if (replayDelay) await new Promise((resolve) => window.setTimeout(resolve, replayDelay));
      callLog.append(buildCallLine(line));
    }
    applyCollectionsCall(card, payload.account);
  } catch (error) {
    callLog.remove();
    const note = document.createElement("p");
    note.className = "delivery-error";
    note.textContent = error.message;
    card.append(note);
    button.disabled = false;
    button.textContent = "Trigger Voice Follow-Up";
  }
}

function applyCollectionsCall(card, account) {
  const index = accountsData.findIndex((entry) => entry.account_id === account.account_id);
  if (index >= 0) accountsData[index] = { ...accountsData[index], ...account };

  const calls = card.querySelector(".negotiation-list");
  const call = account.collections.at(-1);
  if (calls && call) calls.append(collectionRow(call));

  const flags = card.querySelector(".account-flags");
  if (flags) {
    flags.replaceChildren(...accountFlagChips({ ...accountsData[index], ...account }));
  }

  if (account.dispute_open || account.payment_reported_at) {
    card.querySelector(".dispatch-button")?.remove();
  } else {
    const button = card.querySelector(".dispatch-button");
    if (button) {
      button.disabled = false;
      button.textContent = "Trigger Voice Follow-Up";
    }
  }
}

async function loadAccounts() {
  try {
    const response = await fetch("/api/finance/accounts");
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.accounts)) throw new Error();
    accountsData = payload.accounts;
    renderFinanceBoard();
  } catch {
    const note = document.createElement("li");
    note.className = "delivery-error";
    note.textContent = "The collections board is unavailable right now.";
    financeListBoard.replaceChildren(note);
  }
}

const invoiceListBoard = document.querySelector("#invoice-list");
let invoicesData = [];

function invoiceCard(invoice) {
  const card = document.createElement("li");
  card.className = "invoice-card";

  const head = document.createElement("div");
  head.className = "invoice-head";
  const id = document.createElement("span");
  id.className = "delivery-id";
  id.textContent = invoice.invoice_id;
  const badge = document.createElement("span");
  badge.className = `status-tag ${invoice.status === "To Be Paid" ? "is-confirmed" : "is-counter"}`;
  badge.textContent = invoice.status;
  head.append(id, badge);

  const meta = document.createElement("p");
  meta.className = "invoice-meta";
  const generated = dateLabel(invoice.generated_at.slice(0, 10));
  const due = dateLabel(invoice.due_date);
  meta.textContent = `Generated ${generated} · Due ${due} · Credit terms: ${invoice.credit_terms} · Bill to: ${invoice.bill_to}`;

  const table = document.createElement("table");
  table.className = "invoice-items";
  const headerRow = document.createElement("tr");
  for (const label of ["Product", "Quantity", "Rate", "Amount"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  }
  table.append(headerRow);
  for (const item of invoice.items) {
    const row = document.createElement("tr");
    const values = [
      item.product,
      `${item.quantity} ${item.unit}`,
      item.rate_inr_per_unit === null ? "Rate missing" : `₹${item.rate_inr_per_unit.toLocaleString("en-IN")}`,
      item.amount_inr === null ? "—" : `₹${item.amount_inr.toLocaleString("en-IN")}`
    ];
    values.forEach((value, valueIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (item.rate_inr_per_unit === null && valueIndex > 1) td.className = "invoice-unpriced";
      row.append(td);
    });
    table.append(row);
  }

  const total = document.createElement("p");
  total.className = "invoice-total";
  total.textContent = invoice.total_inr === null ? "Total: pending pricing approval" : `Total: ₹${invoice.total_inr.toLocaleString("en-IN")}`;

  const fineprint = document.createElement("p");
  fineprint.className = "invoice-fineprint";
  fineprint.textContent = "Simulated proforma invoice generated from a voice-order draft. Not a legal invoice; amounts without a listed rate are flagged for pricing approval.";

  const actions = document.createElement("div");
  actions.className = "invoice-actions";
  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.className = "new-order-button";
  printButton.textContent = "Print";
  printButton.addEventListener("click", () => {
    document.querySelectorAll(".print-target").forEach((node) => node.classList.remove("print-target"));
    card.classList.add("print-target");
    window.print();
    card.classList.remove("print-target");
  });
  actions.append(printButton);

  card.append(head, meta, table, total, fineprint, actions);
  return card;
}

function renderInvoiceBoard() {
  if (!invoicesData.length) {
    const note = document.createElement("li");
    note.className = "delivery-loading";
    note.textContent = "No invoices yet. Complete a voice order on the 01 / Order Desk tab — a proforma invoice is generated automatically.";
    invoiceListBoard.replaceChildren(note);
    return;
  }
  invoiceListBoard.replaceChildren(...invoicesData.map(invoiceCard));
}

async function loadInvoices() {
  try {
    const response = await fetch("/api/finance/invoices");
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.invoices)) throw new Error();
    invoicesData = payload.invoices;
    renderInvoiceBoard();
  } catch {
    const note = document.createElement("li");
    note.className = "delivery-error";
    note.textContent = "The invoices board is unavailable right now.";
    invoiceListBoard.replaceChildren(note);
  }
}

const tabButtons = document.querySelectorAll(".tab");

function activateTab(selectedTab) {
  for (const tab of tabButtons) {
    const active = tab === selectedTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    document.getElementById(tab.dataset.panel).hidden = !active;
  }
}

for (const tab of tabButtons) {
  tab.addEventListener("click", () => activateTab(tab));
}

checkServer();
loadDeliveries();
loadCarriers();
loadAccounts();
loadInvoices();
