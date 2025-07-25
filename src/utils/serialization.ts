/**
 * Safely stringify an object to JSON, handling circular references,
 * Error objects, functions, and other non-serializable values.
 * @param obj - The object to stringify
 * @param space - Number of spaces for pretty-printing (optional)
 * @returns JSON string representation
 */
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
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
            acc[prop] = (value as any)[prop];
          }
          return acc;
        }, {} as any)
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
  }, space);
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
export function filterSensitiveData(obj: any, sensitiveKeys: string[] = ['password', 'token', 'secret', 'key', 'auth']): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const filtered = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const shouldFilter = sensitiveKeys.some(sensitiveKey => 
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    );
    
    if (shouldFilter) {
      (filtered as any)[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      (filtered as any)[key] = filterSensitiveData(value, sensitiveKeys);
    } else {
      (filtered as any)[key] = value;
    }
  }
  
  return filtered;
}