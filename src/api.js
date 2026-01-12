
export const API_BASE = "https://bulkhubdatabase-production.up.railway.app";

async function toJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: "Invalid JSON from API", status: res.status, raw: text };
  }
}

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
