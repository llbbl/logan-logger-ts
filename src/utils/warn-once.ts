/**
 * Messages already emitted, so a misconfigured variable or config file warns
 * once rather than once per logger constructed — or, for a service that loads
 * its config per request, once per request forever.
 *
 * Internal: not exported from any entry point.
 */
const warned = new Set<string>();

/**
 * Emit a diagnostic at most once per distinct message.
 * @param message - The warning, used verbatim as the dedupe key
 */
export function warnOnce(message: string): void {
  if (warned.has(message)) {
    return;
  }

  warned.add(message);
  console.warn(message);
}

/** Forget every message emitted so far. Exposed for tests. */
export function resetWarnings(): void {
  warned.clear();
}
