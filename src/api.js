export const API_BASE = "https://bulk_hub_database.railway.internal.railway.app";

export async function getDiscordTop(limit = 15) {
  const r = await fetch(${API_BASE}/discord/top/${limit});
  return await r.json();
}

export async function getTelegramTop(limit = 15) {
  const r = await fetch(${API_BASE}/telegram/top/${limit});
  return await r.json();
}

export async function findDiscordUser(username) {
  const r = await fetch(${API_BASE}/dc/${encodeURIComponent(username)});
  return await r.json();
}

export async function findTelegramUser(username) {
  const r = await fetch(${API_BASE}/tg/${encodeURIComponent(username)});
  return await r.json();
}
