import { describe, expect, it } from 'vitest';
import * as browser from '../src/browser.ts';
import * as bun from '../src/bun.ts';
import { LogLevel } from '../src/core/types.ts';
import * as deno from '../src/deno.ts';
import * as main from '../src/index.ts';
import * as node from '../src/node.ts';

describe('runtime entry exports', () => {
  it.each([
    ['main', main],
    ['node', node],
    ['browser', browser],
    ['deno', deno],
    ['bun', bun],
  ])('exports a usable LogLevel enum from %s', (_name, entry) => {
    expect(entry).toHaveProperty('LogLevel', LogLevel);
  });
});
