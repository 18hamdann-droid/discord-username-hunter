const BASE_URL = "https://discord.com/api/v10";

export interface CheckResult {
  username: string;
  available: boolean;
}

export async function checkUsername(username: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/unique-username/username-attempt-unauthed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    if (response.status === 200) {
      const data = (await response.json()) as { taken?: boolean };
      return !data.taken;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
      await sleep(waitMs);
      return checkUsername(username);
    }

    return false;
  } catch {
    return false;
  }
}

export function* generateRandomUsernames(config: {
  length: number;
  charSet: string;
  prefix?: string;
  suffix?: string;
}): Generator<string> {
  const { length, charSet, prefix = "", suffix = "" } = config;
  const chars = charSet.split("");
  const innerLength = length - prefix.length - suffix.length;

  if (innerLength <= 0) {
    yield prefix + suffix;
    return;
  }

  const totalCombinations = Math.pow(chars.length, innerLength);

  if (totalCombinations <= 150_000) {
    const all: string[] = [];
    const indices = new Array(innerLength).fill(0);
    while (true) {
      all.push(prefix + indices.map((i) => chars[i]).join("") + suffix);
      let pos = innerLength - 1;
      while (pos >= 0) {
        indices[pos]++;
        if (indices[pos] < chars.length) break;
        indices[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j]!, all[i]!];
    }
    yield* all;
  } else {
    const seen = new Set<string>();
    let consecutiveDups = 0;
    while (consecutiveDups < 200) {
      let inner = "";
      for (let i = 0; i < innerLength; i++) {
        inner += chars[Math.floor(Math.random() * chars.length)];
      }
      const username = prefix + inner + suffix;
      if (!seen.has(username)) {
        seen.add(username);
        consecutiveDups = 0;
        yield username;
      } else {
        consecutiveDups++;
      }
    }
  }
}

export function totalCombinations(config: {
  length: number;
  charSet: string;
  prefix?: string;
  suffix?: string;
}): number {
  const inner = config.length - (config.prefix?.length ?? 0) - (config.suffix?.length ?? 0);
  return inner <= 0 ? 1 : Math.pow(config.charSet.length, inner);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
