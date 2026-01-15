export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function toJson(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { error: "Invalid JSON from API", status: res.status, raw: text };
  }

  // Если сервер вернул ошибку — вернем объект с ошибкой, чтобы UI показал это нормально
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      ...((data && typeof data === "object") ? data : { raw: text }),
    };
  }

  return data;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    cache: "no-store",
  });
  return toJson(res);
}

// --- SOCIAL / COMMUNITY ---
export async function getTelegramTop(limit = 15) {
  return apiGet(`/telegram/top/${limit}`);
}

export async function getDiscordTop(limit = 15) {
  return apiGet(`/discord/top/${limit}`);
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

// --- STAKE (SANCTUM + SOLSCAN) ---
// Эти эндпоинты должны существовать на бекенде:
//   GET /sanctum/latest
//   GET /solscan/latest/10   (или любой лимит)
export async function getLatestSanctum() {
  return apiGet(`/sanctum/latest`);
}

export async function getLatestSolscan(limit = 10) {
  const safe = Math.max(1, Math.min(50, Number(limit) || 10));
  return apiGet(`/solscan/latest/${safe}`);
}
