export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function toJson(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { error: "Invalid JSON from API", status: res.status, raw: text };
  }

  // если бек вернул не 2xx — вернем структурированную ошибку
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      ...(data && typeof data === "object" ? data : { raw: text }),
    };
  }

  return data;
}

async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });
  return toJson(res);
}

// ---------- COMMUNITY ----------
export async function getTelegramTop(limit = 15) {
  return apiGet(`/telegram/top/${encodeURIComponent(limit)}`);
}

export async function getDiscordTop(limit = 15) {
  return apiGet(`/discord/top/${encodeURIComponent(limit)}`);
}

export async function findTelegramUser(username) {
  return apiGet(`/tg/${encodeURIComponent(username)}`);
}

export async function findDiscordUser(username) {
  return apiGet(`/dc/${encodeURIComponent(username)}`);
}

export async function getCommunityStats() {
  return apiGet(`/community/stats`);
}

// ---------- STAKE (Sanctum + Solscan) ----------
export async function getLatestSanctum() {
  return apiGet(`/sanctum/latest`);
}

// ВАЖНО: у тебя на бекенде /solscan/latest?limit=10
export async function getLatestSolscan(limit = 10) {
  const safe = Math.max(1, Math.min(200, Number(limit) || 10));
  return apiGet(`/solscan/latest?limit=${safe}`);
}
