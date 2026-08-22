/**
 * Maximum traversal depth before `safeStringify` stops descending.
 * Deeply nested metadata would otherwise recurse until the call stack fails.
 */
const DEFAULT_MAX_DEPTH = 100;

/** Options accepted by {@link safeStringify}. */
export interface SafeStringifyOptions {
  /** Maximum nesting depth before `'[MaxDepth]'` is emitted. Defaults to 100. */
  maxDepth?: number;
}

/**
 * Build a sanitized clone of `value` with all non-serializable values replaced
 * by markers.
 *
 * `ancestors` holds the objects on the **current path** only. It is unwound in
 * the `finally` below, so a value is reported as `'[Circular]'` when it is its
 * own ancestor, not merely because it was encountered earlier somewhere else.
 * Sibling references to the same object serialize in full at each occurrence.
 */
function sanitize(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  maxDepth: number
): unknown {
  // Substitutions for values JSON cannot represent. `undefined` is intercepted
  // here because JSON.stringify would otherwise drop the property entirely.
  if (value === undefined) {
    return '[undefined]';
  }
  if (typeof value === 'bigint') {
    return `[BigInt: ${value.toString()}]`;
  }
  if (typeof value === 'symbol') {
    return `[Symbol: ${value.toString()}]`;
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const container = value as object;

  if (ancestors.has(container)) {
    return '[Circular]';
  }
  if (depth >= maxDepth) {
    return '[MaxDepth]';
  }

  ancestors.add(container);

  try {
    if (container instanceof Error) {
      return sanitizeEntries(serializeError(container), ancestors, depth, maxDepth);
    }

    // Mirror JSON.stringify, which consults toJSON before serializing. This is
    // what keeps Date values as ISO-8601 strings rather than empty objects.
    const toJSON = (container as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return sanitize(toJSON.call(container), ancestors, depth, maxDepth);
    }

    if (Array.isArray(container)) {
      // Indexed rather than mapped: Array.prototype.map skips holes, and a hole
      // must still render as '[undefined]'.
      const items: unknown[] = [];
      for (let index = 0; index < container.length; index++) {
        items.push(sanitize(container[index], ancestors, depth + 1, maxDepth));
      }
      return items;
    }

    return sanitizeEntries(container as Record<string, unknown>, ancestors, depth, maxDepth);
  } finally {
    ancestors.delete(container);
  }
}

function sanitizeEntries(
  source: Record<string, unknown>,
  ancestors: Set<object>,
  depth: number,
  maxDepth: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    result[key] = sanitize(entry, ancestors, depth + 1, maxDepth);
  }

  return result;
}

/**
 * Safely stringify a value to JSON, handling circular references,
 * Error objects, functions, and other non-serializable values.
 * @param obj - The value to stringify
 * @param space - Number of spaces for pretty-printing (optional)
 * @param options - Traversal limits (optional)
 * @returns JSON string representation
 * @example
 * ```typescript
 * const user = { id: 7 };
 * safeStringify({ actor: user, owner: user });
 * // {"actor":{"id":7},"owner":{"id":7}} — a repeated reference is not a cycle
 *
 * const cyclic: any = {};
 * cyclic.self = cyclic;
 * safeStringify(cyclic); // {"self":"[Circular]"}
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Serialization utility accepts arbitrary input types
export function safeStringify(obj: any, space?: number, options: SafeStringifyOptions = {}): string {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  return JSON.stringify(sanitize(obj, new Set<object>(), 0, maxDepth), null, space);
}

/**
 * Default key set (SPEC §8.2).
 *
 * The joined spellings on the second line are **not** redundant with the first
 * and MUST NOT be trimmed. Tokenization cannot reach them: `apikey` and
 * `monkey` are the same shape — a single all-lowercase token ending in `key` —
 * so no matching rule can redact one and spare the other. Without these five
 * entries, moving from the old substring rule to token matching would *stop*
 * redacting `authorization`, `apikey`, `accesstoken` and `secretkey`, all of
 * which the substring rule caught.
 *
 * That asymmetry is the whole argument: a spurious `[REDACTED]` is visible and
 * annoying, a missing one is a leaked credential nobody ever sees. Coverage may
 * grow, never shrink.
 */
const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'authorization',
  'apikey',
  'authtoken',
  'accesstoken',
  'secretkey',
];

/**
 * One token of a field name, per the boundaries in SPEC §8.1.
 *
 * Written as a match rather than a split so it needs no lookbehind, which is
 * still absent from some of the runtimes this library targets. The three
 * alternatives, in order:
 *
 * - `[A-Z]+(?![a-z])` — an uppercase run that does not hand its last letter to
 *   a following lowercase word, so `APIKey` yields `API` and not `APIK`
 * - `[A-Z]?[a-z]+` — a lowercase word with its optional leading capital
 * - `[0-9]+` — a digit run, which is what makes `key1` split into `key` and `1`
 *
 * Anything outside `[A-Za-z0-9]` matches nothing and is therefore dropped,
 * which is how `_`, `-`, `.` and non-ASCII characters act as separators.
 */
const FIELD_NAME_TOKEN = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g;

/** Split a field name into lowercased tokens (SPEC §8.1). */
function tokenizeFieldName(name: string): string[] {
  return (name.match(FIELD_NAME_TOKEN) ?? []).map((token) => token.toLowerCase());
}

/** A key with everything the match loop needs precomputed. */
interface PreparedKey {
  /** One `[token, token + 's']` pair per token of the key. */
  tokens: [string, string][];
  /** The key's tokens joined, and that joined form pluralized. */
  joined: string;
  joinedPlural: string;
}

/**
 * Tokenize each key by the same rule as a field name (SPEC §8.1).
 *
 * Done once per `filterSensitiveData` call rather than once per field, and the
 * plural forms are materialized here so the match loop below allocates nothing.
 *
 * Tokenizing the key side is required, not cosmetic. Comparing a key raw
 * against each field token silently breaks every multi-token key — a caller
 * passing `creditCard` would get nothing, because the field's tokens are
 * `credit` and `card` and neither equals `creditcard`. It fails closed, with no
 * error, and only for the callers who supplied their own keys.
 */
function prepareKeys(keys: string[]): PreparedKey[] {
  const prepared: PreparedKey[] = [];

  for (const key of keys) {
    const tokens = tokenizeFieldName(key);

    // A key with no tokens (`''`, `'---'`) must match nothing. Skipping it here
    // is what stops it from matching *everything*: the "every token of the key
    // appears" test below is vacuously true for an empty token list.
    if (tokens.length === 0) {
      continue;
    }

    const joined = tokens.join('');

    prepared.push({
      tokens: tokens.map((token) => [token, `${token}s`]),
      joined,
      joinedPlural: `${joined}s`,
    });
  }

  return prepared;
}

/**
 * Decide whether a field name matches any key (SPEC §8.1).
 *
 * Two ways to match, per key:
 *
 * 1. Every token of the key appears among the field's tokens. This is the
 *    general case; for a single-token key it reduces to "some field token
 *    equals the key", which is what every default key exercises.
 * 2. The field's tokens joined equal the key's tokens joined. Load-bearing:
 *    it is what lets a supplied `apiKey` reach a field spelled `apikey`, and
 *    vice versa, which tokenization alone cannot do.
 *
 * In both, a field token also matches the key token followed by `s`, so `ssn`
 * covers `ssns` and `key` covers `keys`.
 */
function matchesAnyKey(fieldName: string, keys: PreparedKey[]): boolean {
  const fieldTokens = tokenizeFieldName(fieldName);

  if (fieldTokens.length === 0) {
    return false;
  }

  const fieldJoined = fieldTokens.join('');

  return keys.some(
    (key) =>
      key.tokens.every(
        ([token, plural]) => fieldTokens.includes(token) || fieldTokens.includes(plural)
      ) ||
      fieldJoined === key.joined ||
      fieldJoined === key.joinedPlural
  );
}

/**
 * Build the redacted copy (SPEC §8.4).
 *
 * `copies` maps each source object to its copy, so a source object visited
 * twice yields the same copy twice. That is what makes a cyclic input
 * terminate, and it is why the copy is registered *before* its properties are
 * walked: a reference back to an ancestor has to find the copy already in the
 * map, or the cycle cannot reconnect and the recursion never bottoms out.
 *
 * The cycle is preserved rather than marked. `'[Circular]'` belongs to
 * `safeStringify` (SPEC §4.1); minting it here too would put two functions in
 * charge of what a cycle looks like, free to drift apart.
 *
 * Sharing is preserved for the same reason it terminates: two fields holding
 * one object give two fields holding one copy. Breaking that apart would be
 * extra work for a less faithful copy.
 */
// biome-ignore lint/suspicious/noExplicitAny: Security utility filters arbitrary object types
function redact(obj: any, keys: PreparedKey[], copies: Map<object, unknown>): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const seen = copies.get(obj);

  if (seen !== undefined) {
    return seen;
  }

  const filtered = Array.isArray(obj) ? [] : {};

  copies.set(obj, filtered);

  for (const [key, value] of Object.entries(obj)) {
    // A recursive call on a primitive returns it untouched, so the two cases
    // the assignment used to split on collapse into one.
    const replacement = matchesAnyKey(key, keys) ? '[REDACTED]' : redact(value, keys, copies);

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment for filtered object
    (filtered as any)[key] = replacement;
  }

  return filtered;
}

/**
 * Filter out sensitive data from an object before logging.
 *
 * Never applied automatically — the caller invokes it (SPEC §8.3).
 *
 * Both the field name and each key are split into tokens, so `api_key`, `apiKey`
 * and `API-KEY` are all redacted while `monkey` and `tokenizer` are not. A field
 * matches a key when every token of the key is present in the field name, or
 * when the two token lists joined are equal; a token also matches that token
 * followed by `s`. Supplying a key set **replaces** the defaults rather than
 * extending them.
 *
 * Because matching is on whole tokens, a name like `mytoken` is one token and is
 * not redacted; pass your own keys if your codebase names fields that way.
 *
 * The result mirrors the input's structure, cycles and shared references
 * included (SPEC §8.4). Redaction produces a value, not a serialization, so it
 * makes no promise that the result is JSON-encodable: hand it to
 * {@link safeStringify}, which renders a cycle as `'[Circular]'`, rather than
 * to `JSON.stringify`, which throws on one exactly as it would on the input.
 *
 * @param obj - The object to filter
 * @param sensitiveKeys - Key names to redact, tokenized and matched case-insensitively
 * @returns A new object with sensitive values replaced with '[REDACTED]'
 * @example
 * ```typescript
 * const data = { username: 'john', password: 'secret123', monkey: 'george' };
 * const filtered = filterSensitiveData(data);
 * // Result: { username: 'john', password: '[REDACTED]', monkey: 'george' }
 *
 * const cyclic: any = { password: 'hunter2' };
 * cyclic.self = cyclic;
 * safeStringify(filterSensitiveData(cyclic));
 * // {"password":"[REDACTED]","self":"[Circular]"}
 * ```
 */
export function filterSensitiveData(
  // biome-ignore lint/suspicious/noExplicitAny: Security utility filters arbitrary object types
  obj: any,
  sensitiveKeys: string[] = DEFAULT_SENSITIVE_KEYS
  // biome-ignore lint/suspicious/noExplicitAny: Security utility filters arbitrary object types
): any {
  // Built per call: a map shared across calls would carry identity state from
  // one caller's object graph into the next.
  return redact(obj, prepareKeys(sensitiveKeys), new Map<object, unknown>());
}

/**
 * Properties emitted first, in this order, and never overwritable by a
 * same-named own property on the error.
 */
const ERROR_CORE_PROPERTIES = ['name', 'message', 'stack'];

/**
 * Read a single own property off an error without letting it break
 * serialization. Accessor properties run user code, which may throw.
 */
function readErrorProperty(error: Error, property: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(error, property);

  if (!descriptor) {
    return undefined;
  }

  if (descriptor.get) {
    try {
      return descriptor.get.call(error);
    } catch {
      return '[Throws]';
    }
  }

  return descriptor.value;
}

/**
 * Serialize Error objects to plain objects for logging.
 * @param error - The error to serialize
 * @returns Serialized error object or original value if not an Error
 * @example
 * ```typescript
 * const error = new Error('Something went wrong');
 * const serialized = serializeError(error);
 * // Result: { name: 'Error', message: 'Something went wrong', stack: '...' }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Error serialization accepts arbitrary error types
export function serializeError(error: any): any {
  if (!(error instanceof Error)) {
    return error;
  }

  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  // Omit `stack` entirely when unavailable rather than emitting null.
  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }

  // All own properties, not just enumerable ones. `message` and `stack` are
  // non-enumerable on a standard Error, so a spread would silently drop
  // anything defined the same way.
  for (const property of Object.getOwnPropertyNames(error)) {
    if (ERROR_CORE_PROPERTIES.includes(property)) {
      continue;
    }
    serialized[property] = readErrorProperty(error, property);
  }

  return serialized;
}
