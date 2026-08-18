const inflightFetches = new Map();

export function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 2500, timeoutMessage = "請求逾時", ...fetchOptions } = options;

  let fetchPromise = inflightFetches.get(url);
  if (!fetchPromise) {
    fetchPromise = fetch(url, fetchOptions).finally(() => {
      inflightFetches.delete(url);
    });
    inflightFetches.set(url, fetchPromise);
  }

  let timeoutId;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
