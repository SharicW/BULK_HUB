export const API_BASE = "https://api.bulkhub.online";

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
    throw new Error(
      `API ${res.status} ${res.statusText} on ${path}: ${typeof data === "string" ? data : JSON.stringify(data)}`
    );
  }

  return data;
}

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

export async function getXTop(limit = 15) {
  return request(`/x/top/${encodeURIComponent(limit)}`);
}

export async function findXUser(username) {
  return request(`/x/${encodeURIComponent(username)}`);
}

export async function getXPosts(username, limit = 30, offset = 0) {
  return request(
    `/x/posts?username=${encodeURIComponent(username)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
  );
}

export async function getXUserTotals(username) {
  return request(`/x/totals/${encodeURIComponent(username)}`);
}



export async function getBulkTestnetLatest() {
  return request(`/bulk/testnet/latest`);
}

export async function getBulkTestnetSummary() {
  return request(`/bulk/testnet/summary`);
}
