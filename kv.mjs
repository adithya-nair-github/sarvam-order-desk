// Durable storage through an Upstash Redis REST endpoint (added from Vercel's Storage tab).
const baseUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const KV_LEDGER_PATH = "kv:orders_ledger";
export const kvConfigured = () => Boolean(baseUrl() && token());

function kvFailure(message) {
  const error = new Error(message);
  error.kvFailure = true;
  return error;
}

export async function kvGet(key) {
  let response;
  try {
    response = await fetch(`${baseUrl()}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token()}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw kvFailure("Could not reach the storage service.");
  }
  if (!response.ok) throw kvFailure(`Storage read failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return typeof payload.result === "string" ? payload.result : null;
}

export async function kvSet(key, value) {
  let response;
  try {
    response = await fetch(`${baseUrl()}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: value,
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw kvFailure("Could not reach the storage service.");
  }
  if (!response.ok) throw kvFailure(`Storage write failed with HTTP ${response.status}.`);
}
