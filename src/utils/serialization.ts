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

      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...Object.getOwnPropertyNames(value).reduce((acc, prop) => {
            if (prop !== 'name' && prop !== 'message' && prop !== 'stack') {
              // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access on Error
              acc[prop] = (value as any)[prop];
            }
            return acc;
            // biome-ignore lint/suspicious/noExplicitAny: Accumulator for dynamic properties
          }, {} as any),
        };
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
// biome-ignore lint/suspicious/noExplicitAny: Error serialization accepts arbitrary error types
export function serializeError(error: any): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      // biome-ignore lint/suspicious/noExplicitAny: Spread Error to capture custom properties
      ...(error as any), // Include any additional properties
    };
  }
  return error;
}
