import { logger } from './logger.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// HTTP çağrıları (Twilio, S3) için üstel geri çekilmeli tekrar.
export async function withRetry(label, fn, { attempts = 5, baseDelayMs = 1000, maxDelayMs = 30_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err?.retryable === false || attempt === attempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger.warn(`${label} başarısız (deneme ${attempt}/${attempts}), ${delay} ms sonra tekrar: ${err.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} ${ms} ms içinde yanıt vermedi`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
