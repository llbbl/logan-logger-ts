/**
 * Safely stringify an object to JSON, handling circular references,
 * Error objects, functions, and other non-serializable values.
 * @param obj - The object to stringify
 * @param space - Number of spaces for pretty-printing (optional)
 * @returns JSON string representation
 */
// biome-ignore lint/suspicious/noExplicitAny: Serialization utility accepts arbitrary input types
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();

  return JSON.stringify(
    obj,
    (_key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }

      // Handle Error objects. Delegates to the single shared serializer below
      // so that safeStringify and serializeError cannot drift apart.
      if (value instanceof Error) {
        return serializeError(value);
      }

      // Handle functions
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }

      // Handle undefined (JSON.stringify normally omits these)
      if (value === undefined) {
        return '[undefined]';
      }

      // Handle BigInt
      if (typeof value === 'bigint') {
        return `[BigInt: ${value.toString()}]`;
      }

      // Handle Symbol
      if (typeof value === 'symbol') {
        return `[Symbol: ${value.toString()}]`;
      }

      return value;
    },
    space
  );
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
