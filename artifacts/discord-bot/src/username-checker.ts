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

export function generateUsernames(config: {
  length: number;
  charSet: string;
  prefix?: string;
  suffix?: string;
}): Generator<string> {
  return generateCombinations(config);
}

function* generateCombinations(config: {
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

  const indices = new Array(innerLength).fill(0);

  while (true) {
    const inner = indices.map((i) => chars[i]).join("");
    yield prefix + inner + suffix;

    let pos = innerLength - 1;
    while (pos >= 0) {
      indices[pos]++;
      if (indices[pos] < chars.length) break;
      indices[pos] = 0;
      pos--;
    }
    if (pos < 0) break;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
