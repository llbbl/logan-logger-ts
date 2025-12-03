// Example usage with new @ import syntax
import { createLogger, LogLevel } from '@/core/factory';
import { detectRuntime } from '@/utils/runtime';
import { filterSensitiveData, safeStringify } from '@/utils/serialization';

// Create a logger with custom configuration
const logger = createLogger({
  level: LogLevel.DEBUG,
  colorize: true,
  metadata: { service: 'example-app' },
});

// Use the logger
logger.info('Application started', {
  runtime: detectRuntime().name,
  timestamp: new Date(),
});

// Handle sensitive data
const userData = {
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',
  apiKey: 'sk_live_abcd1234',
};

const filteredData = filterSensitiveData(userData);
logger.info('User data processed', filteredData);

// Safe serialization
// biome-ignore lint/suspicious/noExplicitAny: Example demonstrating circular reference handling
const circularObj: any = { name: 'test' };
circularObj.self = circularObj;

logger.debug('Complex object', {
  data: safeStringify(circularObj),
});

// Create child logger with additional context
const requestLogger = logger.child({
  requestId: 'req_12345',
  userId: 'user_67890',
});

requestLogger.info('Request processed successfully');
