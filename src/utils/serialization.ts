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
 * Filter out sensitive data from an object before logging.
 * @param obj - The object to filter
 * @param sensitiveKeys - Array of key names to redact (case-insensitive)
 * @returns A new object with sensitive values replaced with '[REDACTED]'
 * @example
 * ```typescript
 * const data = { username: 'john', password: 'secret123' };
 * const filtered = filterSensitiveData(data);
 * // Result: { username: 'john', password: '[REDACTED]' }
 * ```
 */
export function filterSensitiveData(
  // biome-ignore lint/suspicious/noExplicitAny: Security utility filters arbitrary object types
  obj: any,
  sensitiveKeys: string[] = ['password', 'token', 'secret', 'key', 'auth']
  // biome-ignore lint/suspicious/noExplicitAny: Security utility filters arbitrary object types
): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const filtered = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const shouldFilter = sensitiveKeys.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    );

    if (shouldFilter) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment for filtered object
      (filtered as any)[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment for filtered object
      (filtered as any)[key] = filterSensitiveData(value, sensitiveKeys);
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment for filtered object
      (filtered as any)[key] = value;
    }
  }

  return filtered;
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
