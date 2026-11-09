// Unit economics for voice ordering. Pure model functions are exported for tests;
// the page wiring at the bottom only runs in a browser.

// Sarvam published rates (₹, excl. GST, pay-as-you-go) from docs.sarvam.ai pricing, checked Nov 2026.
export const SARVAM_RATES = {
  stt_per_min: 0.49,            // Speech to Text, per minute of audio
  tts_per_1k_chars: 1.0,        // Bulbul v4 Flash, ₹10 per 10K characters
  llm_input_per_m_tokens: 15,   // sarvam-105b input
  llm_output_per_m_tokens: 60,  // sarvam-105b output
  managed_agent_per_min: 3      // managed voice agents "from ₹3 a minute"
};

export const DEFAULTS = {
  distributors: 200,
  orders_per_month: 8,
  price_per_min: 3,
  telephony_per_min: 0.5,       // assumption: check with your telephony provider
  message_cost: 0.15,           // assumption: one WhatsApp/SMS utility message
  telecaller_monthly: 28000,    // assumption: Bengaluru telecaller, fixed + incentive, loaded
  telecaller_talk_min_per_day: 240,
  field_rep_monthly: 35000,     // assumption: FMCG sales officer incl. travel allowance
  field_visits_per_day: 6,
  work_days: 26
};

// How each job is done today (long calls) and in the redesigned flow (short calls).
// Minutes are per order. Rates are the share of orders that need a call at all.
export const WORKFLOWS = [
  {
    id: "book",
    name: "Book the order",
    long: { minutes: 4.0, call_rate: 1, messages: 0, how: "Open-ended call: the distributor lists every SKU, the agent reads the whole order back, then asks about credit." },
    short: { minutes: 1.2, call_rate: 1, messages: 1, how: "The agent opens with a proposed order (last order adjusted for stock velocity). The distributor says yes or changes one line. The full order goes out as a WhatsApp confirmation instead of being read aloud." }
  },
  {
    id: "follow",
    name: "Follow up on delivery",
    long: { minutes: 2.5, call_rate: 1, messages: 0, how: "A status call on every order to confirm dispatch and delivery." },
    short: { minutes: 2.0, call_rate: 0.1, messages: 1, how: "Dispatch and ETA go out as one message. A call only happens on an exception (shop closed, quantity mismatch), about 1 order in 10." }
  },
  {
    id: "collect",
    name: "Collect dues",
    long: { minutes: 3.0, call_rate: 1, messages: 0, how: "A reminder call on every invoice, often repeated." },
    short: { minutes: 1.5, call_rate: 0.3, messages: 2, how: "A UPI payment link goes out with the invoice and again on the due date. Only invoices still unpaid 3 days later get a call, and the agent re-sends the link during the call." }
  }
];

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// Estimated cost of one minute of a self-built agent on Sarvam APIs, before telephony.
export function selfBuiltMinuteCost({
  agent_talk_share = 0.4,
  agent_chars_per_min = 900,
  turns_per_min = 4,
  input_tokens_per_turn = 2000,
  output_tokens_per_turn = 150
} = {}) {
  const stt = SARVAM_RATES.stt_per_min;
  const tts = (agent_talk_share * agent_chars_per_min / 1000) * SARVAM_RATES.tts_per_1k_chars;
  const llm = turns_per_min * (
    input_tokens_per_turn * SARVAM_RATES.llm_input_per_m_tokens / 1e6 +
    output_tokens_per_turn * SARVAM_RATES.llm_output_per_m_tokens / 1e6
  );
  return { stt: round(stt), tts: round(tts), llm: round(llm), total: round(stt + tts + llm) };
}

export function designTotals(design) {
  return WORKFLOWS.reduce((sum, workflow) => {
    const step = workflow[design];
    return {
      minutes: sum.minutes + step.minutes * step.call_rate,
      messages: sum.messages + step.messages
    };
  }, { minutes: 0, messages: 0 });
}

export function computeEconomics(input = {}) {
  const x = { ...DEFAULTS, ...input };
  const long = designTotals("long");
  const short = designTotals("short");

  const telecallerPerMin = x.telecaller_monthly / (x.work_days * x.telecaller_talk_min_per_day);
  const telecallerPerOrder = long.minutes * telecallerPerMin;
  const fieldRepPerOrder = x.field_rep_monthly / (x.work_days * x.field_visits_per_day);
  const aiLongPerOrder = long.minutes * x.price_per_min + long.messages * x.message_cost;
  const aiShortPerOrder = short.minutes * x.price_per_min + short.messages * x.message_cost;

  const breakEvenLong = (telecallerPerOrder - long.messages * x.message_cost) / long.minutes;
  const breakEvenShort = (telecallerPerOrder - short.messages * x.message_cost) / short.minutes;

  const ordersPerMonth = x.distributors * x.orders_per_month;
  const monthly = {
    orders: ordersPerMonth,
    telecaller: round(telecallerPerOrder * ordersPerMonth, 0),
    ai_long: round(aiLongPerOrder * ordersPerMonth, 0),
    ai_short: round(aiShortPerOrder * ordersPerMonth, 0),
    telecallers_needed: round(long.minutes * ordersPerMonth / (x.work_days * x.telecaller_talk_min_per_day), 1),
    ai_minutes_long: round(long.minutes * ordersPerMonth, 0),
    ai_minutes_short: round(short.minutes * ordersPerMonth, 0)
  };

  return {
    inputs: x,
    minutes_per_order: { long: round(long.minutes), short: round(short.minutes) },
    messages_per_order: { long: long.messages, short: short.messages },
    per_order: {
      telecaller: round(telecallerPerOrder),
      field_rep: round(fieldRepPerOrder),
      ai_long: round(aiLongPerOrder),
      ai_short: round(aiShortPerOrder)
    },
    telecaller_per_min: round(telecallerPerMin),
    break_even_per_min: { long: round(breakEvenLong), short: round(breakEvenShort) },
    monthly,
    verdict: verdict(x.price_per_min, breakEvenLong, breakEvenShort)
  };
}

export function verdict(price, breakEvenLong, breakEvenShort) {
  const fmt = (value) => `₹${value.toFixed(2)}`;
  if (price >= breakEvenShort) {
    return { tone: "bad", text: `At ${fmt(price)}/min voice AI costs more than a telecaller even with short calls. It needs to fall below ${fmt(breakEvenShort)}/min.` };
  }
  if (price >= breakEvenLong) {
    return { tone: "mixed", text: `At ${fmt(price)}/min, voice AI loses to a telecaller if it copies today's long calls (break-even ${fmt(breakEvenLong)}/min). It wins only with the short-call design (break-even ${fmt(breakEvenShort)}/min).` };
  }
  return { tone: "good", text: `At ${fmt(price)}/min voice AI already beats a telecaller on long calls (break-even ${fmt(breakEvenLong)}/min), but the margin is thin. The short-call design is what makes it clearly cheaper, with headroom up to ${fmt(breakEvenShort)}/min.` };
}

// ---------- Page wiring (browser only) ----------
if (typeof document !== "undefined" && document.querySelector("#panel-economics")) {
  const inr = (value, places = 0) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
  const fields = [...document.querySelectorAll("[data-econ]")];
  const selfBuilt = selfBuiltMinuteCost();

  const set = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };

  function readInputs() {
    return Object.fromEntries(fields.map((field) => [field.dataset.econ, Number(field.value) || 0]));
  }

  function renderWorkflows() {
    const list = document.getElementById("econ-workflows");
    list.replaceChildren(...WORKFLOWS.map((workflow) => {
      const card = document.createElement("li");
      card.className = "econ-flow";
      const title = document.createElement("h3");
      title.textContent = workflow.name;
      card.append(title);
      for (const design of ["long", "short"]) {
        const step = workflow[design];
        const row = document.createElement("div");
        row.className = `econ-flow-row is-${design}`;
        const label = document.createElement("p");
        label.className = "econ-flow-label";
        const minutes = round(step.minutes * step.call_rate);
        label.textContent = `${design === "long" ? "Today" : "Redesigned"} · ${minutes} min per order${step.messages ? ` + ${step.messages} message${step.messages > 1 ? "s" : ""}` : ""}`;
        const how = document.createElement("p");
        how.className = "econ-flow-how";
        how.textContent = step.how;
        row.append(label, how);
        card.append(row);
      }
      return card;
    }));
  }

  function render() {
    const inputs = readInputs();
    const result = computeEconomics(inputs);
    set("econ-out-telecaller", inr(result.per_order.telecaller, 2));
    set("econ-out-field", inr(result.per_order.field_rep, 2));
    set("econ-out-ai-long", inr(result.per_order.ai_long, 2));
    set("econ-out-ai-short", inr(result.per_order.ai_short, 2));
    set("econ-min-long", `${result.minutes_per_order.long} min`);
    set("econ-min-short", `${result.minutes_per_order.short} min + ${result.messages_per_order.short} messages`);
    set("econ-be-long", `${inr(result.break_even_per_min.long, 2)}/min`);
    set("econ-be-short", `${inr(result.break_even_per_min.short, 2)}/min`);
    set("econ-telecaller-min", `${inr(result.telecaller_per_min, 2)} per talk minute`);
    set("econ-month-orders", result.monthly.orders.toLocaleString("en-IN"));
    set("econ-month-telecaller", inr(result.monthly.telecaller));
    set("econ-month-ai-long", inr(result.monthly.ai_long));
    set("econ-month-ai-short", inr(result.monthly.ai_short));
    set("econ-month-ftes", `${result.monthly.telecallers_needed} telecallers`);
    set("econ-month-saving", inr(result.monthly.telecaller - result.monthly.ai_short));

    const verdictNode = document.getElementById("econ-verdict");
    verdictNode.textContent = result.verdict.text;
    verdictNode.className = `econ-verdict is-${result.verdict.tone}`;

    const max = Math.max(result.per_order.telecaller, result.per_order.ai_long, result.per_order.ai_short, 1);
    for (const [key, id] of [["telecaller", "econ-bar-telecaller"], ["ai_long", "econ-bar-ai-long"], ["ai_short", "econ-bar-ai-short"]]) {
      const bar = document.getElementById(id);
      if (bar) bar.style.width = `${Math.max(2, (result.per_order[key] / max) * 100)}%`;
    }
  }

  set("econ-self-built", `${inr(selfBuilt.total, 2)}/min`);
  set("econ-self-built-parts", `speech-to-text ${inr(selfBuilt.stt, 2)} + voice ${inr(selfBuilt.tts, 2)} + LLM ${inr(selfBuilt.llm, 2)}`);

  for (const button of document.querySelectorAll("[data-price-preset]")) {
    button.addEventListener("click", () => {
      const priceField = document.querySelector('[data-econ="price_per_min"]');
      const telephony = Number(document.querySelector('[data-econ="telephony_per_min"]').value) || 0;
      const preset = button.dataset.pricePreset;
      priceField.value = preset === "self" ? round(selfBuilt.total + telephony).toFixed(2) : preset;
      render();
    });
  }
  for (const field of fields) field.addEventListener("input", render);
  renderWorkflows();
  render();
}
