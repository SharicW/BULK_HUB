export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function toJson(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { error: "Invalid JSON from API", status: res.status, raw: text };
  }

  if (!res.ok) {
    return { ...data, status: res.status, ok: false };
  }
  return data;
}

async function get(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    ...opts,
  });
  return toJson(res);
}

async function post(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return toJson(res);
}

// ----- COMMUNITY -----
export async function getTelegramTop(limit = 15) {
  return get(`/telegram/top/${limit}`);
}

export async function getDiscordTop(limit = 15) {
  return get(`/discord/top/${limit}`);
}

export async function findTelegramUser(username) {
  return get(`/tg/${encodeURIComponent(username)}`);
}

export async function findDiscordUser(username) {
  return get(`/dc/${encodeURIComponent(username)}`);
}

export async function getCommunityStats() {
  return get(`/community/stats`);
}

// ----- SANCTUM -----
export async function getSanctumLatest() {
  return get(`/sanctum/latest`);
}

export async function refreshSanctum() {
  return post(`/sanctum/refresh`);
}

// ----- SOLSCAN -----
export async function getSolscanLatest(limit = 10) {
  return get(`/solscan/latest?limit=${encodeURIComponent(limit)}`);
}

export async function refreshSolscan(limit_rows = 10) {
  return post(`/solscan/refresh?limit_rows=${encodeURIComponent(limit_rows)}`);
}
