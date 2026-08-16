// localStorage-backed reconnect credential: {roomId, playerId, sessionToken}.

const KEY = "wtl:session";

export function saveSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
  return Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}
