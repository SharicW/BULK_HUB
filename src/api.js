export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "accept": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { error: "Invalid JSON from API", status: res.status, raw: text };
  }

  if (!res.ok) {
    // чтобы в консоли было видно, что реально вернул бекенд
    throw new Error(
      `API ${res.status} ${res.statusText} on ${path}: ${typeof data === "string" ? data : JSON.stringify(data)}`
    );
  }

  return data;
}

// --- community / old endpoints ---
export async function getTelegramTop(limit = 15) {
  return request(`/telegram/top/${limit}`);
}

export async function getDiscordTop(limit = 15) {
  return request(`/discord/top/${limit}`);
}

export async function findTelegramUser(username) {
  return request(`/tg/${encodeURIComponent(username)}`);
}

export async function findDiscordUser(username) {
  return request(`/dc/${encodeURIComponent(username)}`);
}

export async function getCommunityStats() {
  return request(`/community/stats`);
}

// --- NEW: sanctum + solscan ---
export async function getSanctumLatest() {
  return request(`/sanctum/latest`);
}

export async function refreshSanctum() {
  return request(`/sanctum/refresh`, { method: "POST" });
}

export async function getSolscanLatest(limit = 10) {
  return request(`/solscan/latest?limit=${encodeURIComponent(limit)}`);
}

export async function refreshSolscan(limitRows = 10) {
  return request(`/solscan/refresh?limit_rows=${encodeURIComponent(limitRows)}`, { method: "POST" });
}

// --- X (Twitter) ---
export async function getXTop(limit = 15) {
  return request(`/x/top/${encodeURIComponent(limit)}`);
}

export async function findXUser(username) {
  return request(`/x/${encodeURIComponent(username)}`);
}
