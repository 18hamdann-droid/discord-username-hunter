import { COOLDOWN_MS } from "./config.js";

export interface UserSession {
  channelId: string;
  guildId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
  startedAt: number;
  results: string[];
  running: boolean;
  stopRequested: boolean;
}

interface CooldownEntry {
  endsAt: number;
}

const sessions = new Map<string, UserSession>();
const cooldowns = new Map<string, CooldownEntry>();

export function getSession(userId: string): UserSession | undefined {
  return sessions.get(userId);
}

export function setSession(userId: string, session: UserSession): void {
  sessions.set(userId, session);
}

export function deleteSession(userId: string): void {
  const session = sessions.get(userId);
  if (session) clearTimeout(session.timeoutHandle);
  sessions.delete(userId);
}

export function isOnCooldown(userId: string): { onCooldown: boolean; remainingMs: number } {
  const entry = cooldowns.get(userId);
  if (!entry) return { onCooldown: false, remainingMs: 0 };
  const now = Date.now();
  if (now >= entry.endsAt) {
    cooldowns.delete(userId);
    return { onCooldown: false, remainingMs: 0 };
  }
  return { onCooldown: true, remainingMs: entry.endsAt - now };
}

export function setCooldown(userId: string): void {
  cooldowns.set(userId, { endsAt: Date.now() + COOLDOWN_MS });
}
