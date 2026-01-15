export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function toJson(res) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    // если API вернул ошибку в json
    if (!res.ok) {
      return { error: data?.error || "API error", status: res.status, raw: data };
    }
    return data;
  } catch (e) {
    return { error: "Invalid JSON from API", status: res.status, raw: text };
  }
}

// --------------------
// EXISTING ENDPOINTS
// --------------------
export async function getTelegramTop(limit = 15) {
  const res = await fetch(`${API_BASE}/telegram/top/${limit}`);
  return toJson(res);
}

export async function getDiscordTop(limit = 15) {
  const res = await fetch(`${API_BASE}/discord/top/${limit}`);
  return toJson(res);
}

export async function findTelegramUser(username) {
  const res = await fetch(`${API_BASE}/tg/${encodeURIComponent(username)}`);
  return toJson(res);
}

export async function findDiscordUser(username) {
  const res = await fetch(`${API_BASE}/dc/${encodeURIComponent(username)}`);
  return toJson(res);
}

export async function getCommunityStats() {
  const res = await fetch(`${API_BASE}/community/stats`);
  return toJson(res);
}

// --------------------
// NEW: SANCTUM + SOLSCAN
// --------------------
export async function getSanctumLatest() {
  // ожидаем { fetched_at, total_staked, bulk_to_sol, total_holders }
  const res = await fetch(`${API_BASE}/api/sanctum/latest`);
  return toJson(res);
}

export async function getSolscanLatest(limit = 10) {
  // ожидаем { items: [...] }
  const res = await fetch(`${API_BASE}/api/solscan/latest?limit=${encodeURIComponent(limit)}`);
  return toJson(res);
}
