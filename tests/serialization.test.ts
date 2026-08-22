import { describe, expect, it } from 'vitest';
import { filterSensitiveData, safeStringify, serializeError } from '../src/utils/serialization.ts';

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
        handler: function namedFunction() {
          return 'test';
        },
        anonymous: () => 'anonymous',
      };

      const result = safeStringify(obj);
      expect(result).toContain('"handler":"[Function: namedFunction]"');
      expect(result).toContain('"anonymous":"[Function: anonymous]"');
    });

    it('should handle undefined values', () => {
      const obj = {
        name: 'test',
        undefinedValue: undefined,
      };

      const result = safeStringify(obj);
      expect(result).toContain('"undefinedValue":"[undefined]"');
    });

    it('should handle BigInt values', () => {
      const obj = {
        name: 'test',
        bigNumber: BigInt(9007199254740991),
      };

      const result = safeStringify(obj);
      expect(result).toContain('"bigNumber":"[BigInt: 9007199254740991]"');
    });

    it('should handle Symbol values', () => {
      const sym = Symbol('test');
      const obj = {
        name: 'test',
        symbol: sym,
      };

      const result = safeStringify(obj);
      expect(result).toContain('"symbol":"[Symbol: Symbol(test)]"');
    });

    it('should handle nested circular references', () => {
      const parent: any = { name: 'parent' };
      parent.child = { name: 'child', parent };

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
        secret: 'my-secret',
        apiKey: 'key123',
        auth: 'bearer token',
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
        normalField: 'normal',
      };

      const filtered = filterSensitiveData(data, ['customSecret']);

      expect(filtered.username).toBe('john');
      expect(filtered.customSecret).toBe('[REDACTED]');
      expect(filtered.normalField).toBe('normal');
    });

    it('should replace the defaults with a supplied key set, and pluralize it', () => {
      const data = { ssn: '1', ssns: '2', password: 'p' };

      const filtered = filterSensitiveData(data, ['ssn']);

      expect(filtered.ssn).toBe('[REDACTED]');
      // The plural rule covers caller-supplied keys, not just the defaults.
      expect(filtered.ssns).toBe('[REDACTED]');
      // `password` survives because a supplied set replaces the defaults.
      expect(filtered.password).toBe('p');
    });

    it('should tokenize a multi-token supplied key across every casing', () => {
      // Regression guard. Comparing a key raw against field tokens redacts NONE
      // of the first three: the field tokens are `credit` and `card`, neither of
      // which equals `creditcard`. It fails closed, silently, and only for
      // callers who supplied their own keys.
      const data = {
        creditCard: '4111',
        credit_card: '4222',
        'CREDIT-CARD': '4333',
        cardHolder: 'j',
        monkey: 'g',
      };

      const filtered = filterSensitiveData(data, ['creditCard']);

      expect(filtered.creditCard).toBe('[REDACTED]');
      expect(filtered.credit_card).toBe('[REDACTED]');
      expect(filtered['CREDIT-CARD']).toBe('[REDACTED]');
      // Only one of the key's two tokens is present.
      expect(filtered.cardHolder).toBe('j');
      expect(filtered.monkey).toBe('g');
    });

    it('should reach a joined spelling from a multi-token key, and back', () => {
      // The joined comparison, which tokenization alone cannot do.
      expect(filterSensitiveData({ apikey: 'a' }, ['apiKey']).apikey).toBe('[REDACTED]');
      expect(filterSensitiveData({ apiKey: 'a' }, ['apikey']).apiKey).toBe('[REDACTED]');
      // It carries the plural rule too.
      expect(filterSensitiveData({ apikeys: 'a' }, ['apiKey']).apikeys).toBe('[REDACTED]');
    });

    it('should match a key whose tokens are a subset of the field name', () => {
      const filtered = filterSensitiveData({ 'x-auth-token': 'a', authorized: 'b' }, ['authToken']);

      expect(filtered['x-auth-token']).toBe('[REDACTED]');
      // `authorized` is a single token; neither key token is present.
      expect(filtered.authorized).toBe('b');
    });

    it('should treat a key with no tokens as matching nothing, not everything', () => {
      // An empty key tokenizes to zero tokens, and "every token of the key is
      // present" is vacuously true for an empty list — so an unguarded
      // implementation redacts the whole object.
      for (const emptyKey of ['', '---', '   ']) {
        const filtered = filterSensitiveData({ username: 'john', note: 'hi' }, [emptyKey]);

        expect(filtered.username).toBe('john');
        expect(filtered.note).toBe('hi');
      }
    });

    it('should tokenize every casing of a name identically', () => {
      const data = {
        api_key: 'a',
        apiKey: 'b',
        'API-KEY': 'c',
        API_KEY: 'd',
        ApiKey: 'e',
        'x-api-key': 'f',
      };

      const filtered = filterSensitiveData(data);

      for (const name of Object.keys(data)) {
        expect(filtered[name]).toBe('[REDACTED]');
      }
    });

    it('should redact the joined spellings carried by the default key set', () => {
      // These are one all-lowercase token each — the same shape as `monkey`.
      // They redact only because the default set lists them explicitly.
      const data = {
        authorization: 'a',
        apikey: 'b',
        authtoken: 'c',
        accesstoken: 'd',
        secretkey: 'e',
      };

      const filtered = filterSensitiveData(data);

      for (const name of Object.keys(data)) {
        expect(filtered[name]).toBe('[REDACTED]');
      }
    });

    it('should match a token that is a key or the key followed by s', () => {
      const data = {
        tokens: 'a',
        keys: 'b',
        passwords: 'c',
        apiKeys: 'd',
        monkeys: 'e',
      };

      const filtered = filterSensitiveData(data);

      expect(filtered.tokens).toBe('[REDACTED]');
      expect(filtered.keys).toBe('[REDACTED]');
      expect(filtered.passwords).toBe('[REDACTED]');
      expect(filtered.apiKeys).toBe('[REDACTED]');
      // `monkeys` is not `key` + s; it is a single token.
      expect(filtered.monkeys).toBe('e');
    });

    it('should split at letter/digit boundaries without over-matching', () => {
      const data = { key1: 'a', token2: 'b', api_key_2: 'c', sha256: 'd' };

      const filtered = filterSensitiveData(data);

      expect(filtered.key1).toBe('[REDACTED]');
      expect(filtered.token2).toBe('[REDACTED]');
      expect(filtered.api_key_2).toBe('[REDACTED]');
      // sha256 splits to `sha` and `256`, matching nothing.
      expect(filtered.sha256).toBe('d');
    });

    it('should leave names that merely contain a key as a substring', () => {
      // The over-match table from #61: every one of these was redacted by the
      // old substring rule.
      const data = {
        monkey: 'george',
        keyboard: 'qwerty',
        keywords: ['a', 'b'],
        tokenizer: 'bpe',
        author: 'jane',
        monkeys_seen: 3,
      };

      const filtered = filterSensitiveData(data);

      expect(filtered.monkey).toBe('george');
      expect(filtered.keyboard).toBe('qwerty');
      expect(filtered.keywords).toEqual(['a', 'b']);
      expect(filtered.tokenizer).toBe('bpe');
      expect(filtered.author).toBe('jane');
      expect(filtered.monkeys_seen).toBe(3);
    });

    it('should never shrink coverage: every credential-shaped name stays redacted', () => {
      // The guard against a future refactor quietly narrowing the default key
      // set. A false positive here is annoying; a false negative is a leaked
      // credential nobody sees, so this list may grow but must never shrink.
      const credentialFieldNames = [
        'password',
        'passwords',
        'db_password',
        'user_password',
        'token',
        'tokens',
        'authToken',
        'authtoken',
        'access_token',
        'accessToken',
        'accesstoken',
        'refresh_token',
        'refreshToken',
        'bearerToken',
        'secret',
        'client_secret',
        'clientSecret',
        'signingSecret',
        'key',
        'keys',
        'api_key',
        'apiKey',
        'apiKeys',
        'apikey',
        'API_KEY',
        'x-api-key',
        'private_key',
        'privateKey',
        'secretKey',
        'secretkey',
        'sessionKey',
        'encryptionKey',
        'AWS_SECRET_ACCESS_KEY',
        'auth',
        'authorization',
        'Authorization',
      ];

      const data = Object.fromEntries(credentialFieldNames.map((name) => [name, 'leaked']));

      const filtered = filterSensitiveData(data);

      for (const name of credentialFieldNames) {
        expect(filtered[name], `${name} must stay redacted`).toBe('[REDACTED]');
      }
    });

    it('should never shrink coverage for caller-supplied keys either', () => {
      // The companion guard to the one above, for the callers this hole hit:
      // every pair here was redacted by the old substring rule and must stay
      // redacted. Multi-token keys are the whole point — see #61.
      const pairs: Array<[key: string, fieldName: string]> = [
        ['apiKey', 'apiKey'],
        ['apiKey', 'apikey'],
        ['apiKey', 'api_key'],
        ['apiKey', 'API-KEY'],
        ['creditCard', 'creditCard'],
        ['creditCard', 'credit_card'],
        ['customSecret', 'customSecret'],
        ['userPassword', 'userPassword'],
        ['authToken', 'authToken'],
        ['authToken', 'x-auth-token'],
        ['accessToken', 'access_token'],
        ['secretKey', 'SECRET_KEY'],
        ['ssn', 'ssn'],
        ['ssn', 'ssns'],
      ];

      for (const [key, fieldName] of pairs) {
        const filtered = filterSensitiveData({ [fieldName]: 'leaked' }, [key]);

        expect(filtered[fieldName], `key ${key} must redact field ${fieldName}`).toBe('[REDACTED]');
      }
    });

    it('should not redact a name that joins a key into a single token', () => {
      // Documented limitation: `mytoken` is one token, so no rule reaches it.
      // Callers with house naming conventions pass their own keys.
      expect(filterSensitiveData({ mytoken: 'abc' }).mytoken).toBe('abc');
      expect(filterSensitiveData({ mytoken: 'abc' }, ['mytoken']).mytoken).toBe('[REDACTED]');
    });

    it('should handle case-insensitive filtering', () => {
      const data = {
        PASSWORD: 'secret123',
        Token: 'abc123',
        SECRET_KEY: 'my-secret',
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
          password: 'secret123',
        },
        config: {
          apiKey: 'key123',
          timeout: 5000,
        },
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
          { name: 'jane', password: 'secret2' },
        ],
      };

      const filtered = filterSensitiveData(data);

      expect(Array.isArray(filtered.users)).toBe(true);
      expect(filtered.users).toHaveLength(2);
      expect(filtered.users[0].name).toBe('john');
      expect(filtered.users[0].password).toBe('[REDACTED]');
      expect(filtered.users[1].name).toBe('jane');
      expect(filtered.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        password: 'secret',
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
            data: 'normal',
          },
        },
      };

      const filtered = filterSensitiveData(data);

      expect(filtered.level1.level2.password).toBe('[REDACTED]');
      expect(filtered.level1.level2.data).toBe('normal');
      expect(typeof filtered.level1).toBe('object');
      expect(typeof filtered.level1.level2).toBe('object');
    });
  });

  describe('serializeError', () => {
    it('should serialize Error objects correctly', () => {
      const error = new Error('Test error message');
      error.stack = 'Error: Test error message\n    at test (file.js:1:1)';

      const serialized = serializeError(error);

      expect(serialized).toEqual({
        name: 'Error',
        message: 'Test error message',
        stack: 'Error: Test error message\n    at test (file.js:1:1)',
      });
    });

    it('should handle custom error properties', () => {
      const error = new Error('Custom error') as any;
      error.code = 'CUSTOM_ERROR';
      error.statusCode = 500;

      const serialized = serializeError(error);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('Custom error');
      expect(serialized.code).toBe('CUSTOM_ERROR');
      expect(serialized.statusCode).toBe(500);
      expect(serialized.stack).toBeDefined();
    });

    it('should handle different error types', () => {
      const typeError = new TypeError('Type error');
      const rangeError = new RangeError('Range error');

      const serializedType = serializeError(typeError);
      const serializedRange = serializeError(rangeError);

      expect(serializedType.name).toBe('TypeError');
      expect(serializedType.message).toBe('Type error');

      expect(serializedRange.name).toBe('RangeError');
      expect(serializedRange.message).toBe('Range error');
    });

    it('should return non-Error values unchanged', () => {
      expect(serializeError('string')).toBe('string');
      expect(serializeError(123)).toBe(123);
      expect(serializeError({ key: 'value' })).toEqual({ key: 'value' });
      expect(serializeError(null)).toBe(null);
      expect(serializeError(undefined)).toBe(undefined);
    });

    it('should handle Error-like objects', () => {
      const errorLike = {
        name: 'CustomError',
        message: 'Custom message',
        stack: 'stack trace',
      };

      const serialized = serializeError(errorLike);

      expect(serialized).toEqual(errorLike);
    });

    it('should include non-enumerable own properties', () => {
      const error = new Error('hidden');
      Object.defineProperty(error, 'code', {
        value: 'E_HIDDEN',
        enumerable: false,
        configurable: true,
      });

      const serialized = serializeError(error);

      expect(serialized.code).toBe('E_HIDDEN');
    });

    it('should not let an own property overwrite name, message or stack', () => {
      const error = new Error('the real message') as any;
      Object.defineProperty(error, 'name', { value: 'Impostor', enumerable: true });

      const serialized = serializeError(error);

      expect(serialized.name).toBe('Impostor');
      expect(serialized.message).toBe('the real message');
      expect(Object.keys(serialized).filter((k) => k === 'name')).toHaveLength(1);
    });

    it('should emit name, message and stack first, in that order', () => {
      const error = new Error('ordered') as any;
      error.zzz = 1;
      error.aaa = 2;

      expect(Object.keys(serializeError(error)).slice(0, 3)).toEqual([
        'name',
        'message',
        'stack',
      ]);
    });

    it('should omit stack entirely when it is undefined', () => {
      const error = new Error('no stack');
      error.stack = undefined;

      const serialized = serializeError(error);

      expect('stack' in serialized).toBe(false);
    });

    it('should not throw when reading a getter that throws', () => {
      const error = new Error('boom');
      Object.defineProperty(error, 'exploding', {
        get() {
          throw new Error('getter blew up');
        },
        enumerable: true,
        configurable: true,
      });

      expect(() => serializeError(error)).not.toThrow();
      expect(serializeError(error).exploding).toBe('[Throws]');
      expect(() => safeStringify({ err: error })).not.toThrow();
    });

    it('should include an ES2022 cause', () => {
      const cause = new Error('underlying');
      const error = new Error('wrapper', { cause });

      const serialized = serializeError(error);

      expect(serialized.cause).toBe(cause);
    });

    it('should agree with safeStringify for the same error', () => {
      const build = () => {
        const error = new Error('shared') as any;
        error.stack = 'STACK';
        error.enumerableProp = 'a';
        Object.defineProperty(error, 'hiddenProp', {
          value: 'b',
          enumerable: false,
          configurable: true,
        });
        return error;
      };

      // The two paths disagreed before they were unified: serializeError
      // spread only enumerable own properties and so dropped hiddenProp.
      expect(JSON.parse(safeStringify(build()))).toEqual(
        JSON.parse(JSON.stringify(serializeError(build())))
      );
    });
  });

  describe('safeStringify cycle detection (#57)', () => {
    it('should serialize a repeated sibling reference in full, not as [Circular]', () => {
      const user = { id: 7, name: 'jo' };

      const result = safeStringify({ actor: user, owner: user });

      expect(JSON.parse(result)).toEqual({
        actor: { id: 7, name: 'jo' },
        owner: { id: 7, name: 'jo' },
      });
      expect(result).not.toContain('[Circular]');
    });

    it('should still report a direct self-reference as [Circular]', () => {
      const node: any = { name: 'root' };
      node.self = node;

      expect(JSON.parse(safeStringify(node))).toEqual({ name: 'root', self: '[Circular]' });
    });

    it('should still report an indirect cycle as [Circular]', () => {
      const parent: any = { name: 'parent' };
      parent.child = { name: 'child', parent };

      expect(JSON.parse(safeStringify(parent))).toEqual({
        name: 'parent',
        child: { name: 'child', parent: '[Circular]' },
      });
    });

    it('should serialize the same object twice inside one array', () => {
      const entity = { id: 1 };

      expect(JSON.parse(safeStringify([entity, entity]))).toEqual([{ id: 1 }, { id: 1 }]);
    });

    it('should handle a cycle and a repeated reference in the same payload', () => {
      const shared = { kind: 'shared' };
      const root: any = { a: shared, b: shared };
      root.loop = root;

      expect(JSON.parse(safeStringify(root))).toEqual({
        a: { kind: 'shared' },
        b: { kind: 'shared' },
        loop: '[Circular]',
      });
    });

    it('should serialize a repeated Error instance at every occurrence', () => {
      const error = new Error('boom');
      error.stack = 'STACK';

      const parsed = JSON.parse(safeStringify({ first: error, second: error }));

      expect(parsed.first).toEqual({ name: 'Error', message: 'boom', stack: 'STACK' });
      expect(parsed.second).toEqual(parsed.first);
    });

    it('should serialize an error and its cause when both reference a shared object', () => {
      const request = { id: 'req-1' };
      const cause = new Error('underlying') as any;
      cause.stack = 'CAUSE_STACK';
      cause.request = request;
      const error = new Error('wrapper', { cause }) as any;
      error.stack = 'STACK';
      error.request = request;

      const parsed = JSON.parse(safeStringify(error));

      expect(parsed.request).toEqual({ id: 'req-1' });
      expect(parsed.cause.request).toEqual({ id: 'req-1' });
    });

    it('should keep [undefined] for object properties and array holes', () => {
      expect(safeStringify({ a: undefined })).toBe('{"a":"[undefined]"}');
      expect(safeStringify([1, , 3])).toBe('[1,"[undefined]",3]');
      expect(safeStringify(undefined)).toBe('"[undefined]"');
    });

    it('should leave top-level primitives, null, arrays and empty objects unchanged', () => {
      expect(safeStringify('str')).toBe('"str"');
      expect(safeStringify(42)).toBe('42');
      expect(safeStringify(true)).toBe('true');
      expect(safeStringify(null)).toBe('null');
      expect(safeStringify([])).toBe('[]');
      expect(safeStringify({})).toBe('{}');
    });

    it('should preserve Date values as ISO strings', () => {
      const when = new Date('2026-08-22T04:15:30.123Z');

      expect(safeStringify({ when })).toBe('{"when":"2026-08-22T04:15:30.123Z"}');
    });

    it('should emit [MaxDepth] instead of blowing the stack on deep nesting', () => {
      const root: any = {};
      let cursor = root;
      for (let i = 0; i < 5000; i++) {
        cursor.next = {};
        cursor = cursor.next;
      }

      let result = '';
      expect(() => {
        result = safeStringify(root);
      }).not.toThrow();
      expect(result).toContain('[MaxDepth]');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should respect an explicit maxDepth', () => {
      const value = { a: { b: { c: 1 } } };

      expect(safeStringify(value, undefined, { maxDepth: 2 })).toBe('{"a":{"b":"[MaxDepth]"}}');
    });
  });
});
