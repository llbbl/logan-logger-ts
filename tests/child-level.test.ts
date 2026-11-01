import { describe, expect, it, vi } from 'vitest';
import { LogLevel } from '../src/core/types.ts';
import { BrowserLogger } from '../src/runtime/browser.ts';
import { NodeLogger } from '../src/runtime/node.ts';

describe.each([
  ['NodeLogger', NodeLogger],
  ['BrowserLogger', BrowserLogger],
])('%s child levels', (_name, Logger) => {
  it('inherits the current threshold through children and grandchildren', () => {
    const parent = new Logger({ level: LogLevel.INFO });
    parent.setLevel(LogLevel.SILENT);

    const child = parent.child({ requestId: 'request' });
    const grandchild = child.child({ span: 'span' });
    const message = vi.fn(() => 'must remain silent');

    expect(child.getLevel()).toBe(LogLevel.SILENT);
    expect(grandchild.getLevel()).toBe(LogLevel.SILENT);
    child.error(message);
    grandchild.error(message);
    expect(message).not.toHaveBeenCalled();
  });

  it('keeps existing relatives independent after later level changes', () => {
    const parent = new Logger({ level: LogLevel.INFO });
    parent.setLevel(LogLevel.ERROR);
    const child = parent.child({});

    parent.setLevel(LogLevel.DEBUG);
    expect(child.getLevel()).toBe(LogLevel.ERROR);

    child.setLevel(LogLevel.WARN);
    const grandchild = child.child({});
    child.setLevel(LogLevel.SILENT);

    expect(parent.getLevel()).toBe(LogLevel.DEBUG);
    expect(grandchild.getLevel()).toBe(LogLevel.WARN);
    expect(grandchild.child({}).getLevel()).toBe(LogLevel.WARN);
  });
});
