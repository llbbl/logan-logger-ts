import { describe, it, expect } from 'vitest';
import { safeStringify, filterSensitiveData } from '@/utils/serialization';

describe('Serialization Utilities', () => {
  describe('safeStringify', () => {
    it('should stringify simple objects correctly', () => {
      const obj = { name: 'test', value: 42 };
      const result = safeStringify(obj);
      expect(result).toBe('{"name":"test","value":42}');
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      
      const result = safeStringify(obj);
      expect(result).toContain('"name":"test"');
      expect(result).toContain('"self":"[Circular]"');
    });

    it('should serialize Error objects with stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      const result = safeStringify(error);
      const parsed = JSON.parse(result);
      
      expect(parsed.name).toBe('Error');
      expect(parsed.message).toBe('Test error');
      expect(parsed.stack).toBe('Error: Test error\n    at test.js:1:1');
    });

    it('should handle custom Error properties', () => {
      const error = new Error('Test error') as any;
      error.code = 'CUSTOM_ERROR';
      error.details = { foo: 'bar' };
      
      const result = safeStringify(error);
      const parsed = JSON.parse(result);
      
      expect(parsed.code).toBe('CUSTOM_ERROR');
      expect(parsed.details).toEqual({ foo: 'bar' });
    });

    it('should handle functions', () => {
      const obj = {
        name: 'test',
        handler: function namedFunction() { return 'test'; },
        anonymous: () => 'anonymous'
      };
      
      const result = safeStringify(obj);
      expect(result).toContain('"handler":"[Function: namedFunction]"');
      expect(result).toContain('"anonymous":"[Function: anonymous]"');
    });

    it('should handle undefined values', () => {
      const obj = {
        name: 'test',
        undefinedValue: undefined
      };
      
      const result = safeStringify(obj);
      expect(result).toContain('"undefinedValue":"[undefined]"');
    });

    it('should handle BigInt values', () => {
      const obj = {
        name: 'test',
        bigNumber: BigInt(9007199254740991)
      };
      
      const result = safeStringify(obj);
      expect(result).toContain('"bigNumber":"[BigInt: 9007199254740991]"');
    });

    it('should handle Symbol values', () => {
      const sym = Symbol('test');
      const obj = {
        name: 'test',
        symbol: sym
      };
      
      const result = safeStringify(obj);
      expect(result).toContain('"symbol":"[Symbol: Symbol(test)]"');
    });

    it('should handle nested circular references', () => {
      const parent: any = { name: 'parent' };
      const child: any = { name: 'child', parent };
      parent.child = child;
      
      const result = safeStringify(parent);
      expect(result).toContain('"name":"parent"');
      expect(result).toContain('"name":"child"');
      expect(result).toContain('[Circular]');
    });

    it('should handle arrays with circular references', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr);
      
      const result = safeStringify(arr);
      expect(result).toContain('[1,2,3,"[Circular]"]');
    });

    it('should respect space parameter for pretty printing', () => {
      const obj = { a: 1, b: 2 };
      const result = safeStringify(obj, 2);
      expect(result).toContain('{\n  "a": 1,\n  "b": 2\n}');
    });
  });

  describe('filterSensitiveData', () => {
    it('should filter default sensitive keys', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        token: 'abc123',
        secret: 'mysecret',
        apiKey: 'key123',
        auth: 'bearer token'
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.username).toBe('john');
      expect(filtered.password).toBe('[REDACTED]');
      expect(filtered.token).toBe('[REDACTED]');
      expect(filtered.secret).toBe('[REDACTED]');
      expect(filtered.apiKey).toBe('[REDACTED]');
      expect(filtered.auth).toBe('[REDACTED]');
    });

    it('should filter custom sensitive keys', () => {
      const data = {
        username: 'john',
        customSecret: 'secret123',
        normalField: 'normal'
      };
      
      const filtered = filterSensitiveData(data, ['customSecret']);
      
      expect(filtered.username).toBe('john');
      expect(filtered.customSecret).toBe('[REDACTED]');
      expect(filtered.normalField).toBe('normal');
    });

    it('should handle case-insensitive filtering', () => {
      const data = {
        PASSWORD: 'secret123',
        Token: 'abc123',
        SECRET_KEY: 'mysecret'
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.PASSWORD).toBe('[REDACTED]');
      expect(filtered.Token).toBe('[REDACTED]');
      expect(filtered.SECRET_KEY).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'john',
          password: 'secret123'
        },
        config: {
          apiKey: 'key123',
          timeout: 5000
        }
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.user.name).toBe('john');
      expect(filtered.user.password).toBe('[REDACTED]');
      expect(filtered.config.apiKey).toBe('[REDACTED]');
      expect(filtered.config.timeout).toBe(5000);
    });

    it('should handle arrays', () => {
      const data = {
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' }
        ]
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.users[0].name).toBe('john');
      expect(filtered.users[0].password).toBe('[REDACTED]');
      expect(filtered.users[1].name).toBe('jane');
      expect(filtered.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        password: 'secret'
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.nullValue).toBe(null);
      expect(filtered.undefinedValue).toBe(undefined);
      expect(filtered.password).toBe('[REDACTED]');
    });

    it('should handle primitive values', () => {
      expect(filterSensitiveData('string')).toBe('string');
      expect(filterSensitiveData(123)).toBe(123);
      expect(filterSensitiveData(true)).toBe(true);
      expect(filterSensitiveData(null)).toBe(null);
    });

    it('should preserve original object structure', () => {
      const data = {
        level1: {
          level2: {
            password: 'secret',
            data: 'normal'
          }
        }
      };
      
      const filtered = filterSensitiveData(data);
      
      expect(filtered.level1.level2.password).toBe('[REDACTED]');
      expect(filtered.level1.level2.data).toBe('normal');
      expect(typeof filtered.level1).toBe('object');
      expect(typeof filtered.level1.level2).toBe('object');
    });
  });
});