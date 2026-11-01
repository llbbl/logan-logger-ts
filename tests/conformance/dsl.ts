/**
 * The value-construction DSL from `fixtures/README.md`.
 *
 * Fixtures are plain JSON, so values JSON cannot express — cycles, callables,
 * big integers, symbols, errors — arrive as tagged objects that a runner
 * materializes into native values before handing them to the implementation.
 */

/** Tags this runner understands. Anything else is a case it must skip, not guess at. */
const KNOWN_TAGS = new Set([
  '$id',
  '$ref',
  '$fn',
  '$undefined',
  '$bigint',
  '$symbol',
  '$error',
  '$lazy',
]);

/**
 * Raised when a fixture uses a tag with no TypeScript equivalent.
 *
 * `fixtures/README.md`: a runner MUST skip such a case and report it with a
 * reason, and MUST NOT fabricate a substitute.
 */
export class UnsupportedTagError extends Error {
  constructor(readonly tag: string) {
    super(`no TypeScript equivalent for DSL tag '${tag}'`);
    this.name = 'UnsupportedTagError';
  }
}

interface ErrorSpec {
  name: string;
  message: string;
  stack?: string;
  props?: Record<string, unknown>;
  non_enumerable?: string[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Materializes one case's values, holding the state that has to be shared
 * across the whole case: the `$id` binding table, the real stacks produced for
 * `$error`, and the `$lazy` invocation count.
 */
export class Dsl {
  private readonly bindings = new Map<string, unknown>();
  private readonly stacks: string[] = [];

  /** How many times a `$lazy` message was actually called. */
  lazyInvocations = 0;

  /**
   * Turn a fixture value into a native one.
   * @param node - The JSON node to materialize
   * @returns The native value
   */
  materialize(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map((item) => this.materialize(item));
    }

    if (!isPlainRecord(node)) {
      return node;
    }

    const tag = this.tagOf(node);

    switch (tag) {
      case undefined:
        return this.materializeRecord(node, {});
      case '$id':
        return this.bind(String(node.$id), node.value);
      case '$ref':
        return this.lookup(String(node.$ref));
      case '$fn':
        return makeFunction(node.$fn === null ? null : String(node.$fn));
      case '$undefined':
        return undefined;
      case '$bigint':
        return BigInt(String(node.$bigint));
      case '$symbol':
        return Symbol(String(node.$symbol));
      case '$lazy':
        return this.makeLazy(String(node.$lazy));
      case '$error':
        return this.makeError(node.$error as ErrorSpec);
      default:
        throw new UnsupportedTagError(tag);
    }
  }

  /**
   * Replace real stack text with the literal placeholder the fixtures compare
   * against.
   *
   * `fixtures/README.md` requires substitution on the *output*, not a fake
   * stack on the input — so the error really does carry a captured stack and
   * the implementation really does have to emit it.
   * @param output - Serialized output from the implementation
   * @returns The same string with every real stack replaced by `<STACK>`
   */
  applyStackPlaceholder(output: string): string {
    let result = output;

    // Longest first: one stack can be a prefix of another when two errors are
    // constructed on the same line.
    for (const stack of [...this.stacks].sort((a, b) => b.length - a.length)) {
      result = result.split(JSON.stringify(stack)).join('"<STACK>"');
      result = result.split(stack).join('<STACK>');
    }

    return result;
  }

  private tagOf(node: Record<string, unknown>): string | undefined {
    let matched: string | undefined;

    for (const key of Object.keys(node)) {
      if (!key.startsWith('$')) {
        continue;
      }
      if (!KNOWN_TAGS.has(key)) {
        throw new UnsupportedTagError(key);
      }
      matched = key;
    }

    return matched;
  }

  private materializeRecord(
    node: Record<string, unknown>,
    target: Record<string, unknown>
  ): Record<string, unknown> {
    for (const [key, value] of Object.entries(node)) {
      target[key] = this.materialize(value);
    }

    return target;
  }

  /**
   * Bind a value to a name for later `$ref`.
   *
   * A container is created and bound *before* its contents are materialized,
   * which is the only way a `$ref` nested inside it can close a cycle back onto
   * it.
   */
  private bind(name: string, node: unknown): unknown {
    if (Array.isArray(node)) {
      const shell: unknown[] = [];
      this.bindings.set(name, shell);
      for (const item of node) {
        shell.push(this.materialize(item));
      }
      return shell;
    }

    if (isPlainRecord(node) && this.tagOf(node) === undefined) {
      const shell: Record<string, unknown> = {};
      this.bindings.set(name, shell);
      return this.materializeRecord(node, shell);
    }

    const value = this.materialize(node);
    this.bindings.set(name, value);
    return value;
  }

  private lookup(name: string): unknown {
    if (!this.bindings.has(name)) {
      throw new Error(`$ref "${name}" has no matching $id; fixture bindings are order-dependent`);
    }

    return this.bindings.get(name);
  }

  private makeLazy(text: string): () => string {
    return () => {
      this.lazyInvocations += 1;
      return text;
    };
  }

  private makeError(spec: ErrorSpec): Error {
    const error = new Error(spec.message);

    if (spec.name !== error.name) {
      error.name = spec.name;
    }

    if (spec.stack === undefined) {
      // The fixture asks for an error without stack capture, which §4.2 allows.
      delete (error as { stack?: string }).stack;
      // Firefox exposes stack through an inherited accessor, so deleting an
      // own property alone can leave a captured stack visible. Shadow it only
      // on runtimes that still expose a stack property through the prototype.
      // Avoid invoking that accessor while canonicalizing the fixture input.
      if ('stack' in error) {
        Object.defineProperty(error, 'stack', {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    } else if (error.stack !== undefined) {
      this.stacks.push(error.stack);
    }

    // The language-neutral input describes only name/message/stack and the
    // explicit props below. Bun and WebKit add their own line/sourceURL-style
    // properties to a freshly constructed Error; those are runtime diagnostics,
    // not custom properties requested by this fixture. Canonicalize the input
    // before handing it to the logger, while retaining the native Error and its
    // real captured stack. Never strip fields from the logger's output.
    for (const property of Object.getOwnPropertyNames(error)) {
      if (!['name', 'message', 'stack'].includes(property)) {
        if (!Reflect.deleteProperty(error, property)) {
          throw new Error(`Cannot materialize canonical fixture Error: '${property}' is not configurable`);
        }
      }
    }

    const nonEnumerable = new Set(spec.non_enumerable ?? []);

    for (const [key, value] of Object.entries(spec.props ?? {})) {
      Object.defineProperty(error, key, {
        value: this.materialize(value),
        enumerable: !nonEnumerable.has(key),
        writable: true,
        configurable: true,
      });
    }

    return error;
  }
}

/**
 * Build a callable with a specific name.
 *
 * `name` is assigned explicitly rather than relying on named evaluation,
 * because a `const` binding would otherwise give an "anonymous" function the
 * variable's name.
 */
function makeFunction(name: string | null): () => void {
  const fn = (): void => undefined;

  Object.defineProperty(fn, 'name', { value: name ?? '', configurable: true });

  return fn;
}
