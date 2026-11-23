// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromFrame, listenToFrame, OPAQUE_ORIGIN, postToFrame } from './frame-messages';

describe('a message from a frame', () => {
  const frame = {} as Window;
  const other = {} as Window;

  it('counts only from our frame, on our origin', () => {
    expect(fromFrame({ source: frame, origin: OPAQUE_ORIGIN, data: 1 }, frame, OPAQUE_ORIGIN)).toBe(true);
  });

  it('is refused from another window, even with the right origin', () => {
    expect(fromFrame({ source: other, origin: OPAQUE_ORIGIN, data: 1 }, frame, OPAQUE_ORIGIN)).toBe(false);
  });

  it('is refused from our frame on another origin', () => {
    expect(fromFrame({ source: frame, origin: 'https://evil.example', data: 1 }, frame, OPAQUE_ORIGIN)).toBe(
      false,
    );
  });

  it('is refused before the frame exists', () => {
    expect(fromFrame({ source: undefined, origin: OPAQUE_ORIGIN, data: 1 }, null, OPAQUE_ORIGIN)).toBe(false);
  });
});

describe('listening to a frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A window of its own, so a test can send it messages without a browser.
  function fakeWindow() {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    return (source: unknown, origin: string, data: unknown) => {
      const event = Object.assign(new Event('message'), { source, origin, data });
      target.dispatchEvent(event);
    };
  }

  it('passes on what our frame sends, and nothing from elsewhere', () => {
    const send = fakeWindow();
    const frame = {} as Window;
    const heard: unknown[] = [];
    listenToFrame(
      () => frame,
      OPAQUE_ORIGIN,
      (data) => heard.push(data),
    );
    send(frame, OPAQUE_ORIGIN, 'ours');
    send({}, OPAQUE_ORIGIN, 'another window');
    send(frame, 'https://evil.example', 'another origin');
    expect(heard).toEqual(['ours']);
  });

  it('finds a frame that loads after the listening started', () => {
    const send = fakeWindow();
    let frame: Window | null = null;
    const heard: unknown[] = [];
    listenToFrame(
      () => frame,
      OPAQUE_ORIGIN,
      (data) => heard.push(data),
    );
    send(null, OPAQUE_ORIGIN, 'too early');
    frame = {} as Window;
    send(frame, OPAQUE_ORIGIN, 'loaded');
    expect(heard).toEqual(['loaded']);
  });

  it('hears nothing more once stopped', () => {
    const send = fakeWindow();
    const frame = {} as Window;
    const heard: unknown[] = [];
    const stop = listenToFrame(
      () => frame,
      OPAQUE_ORIGIN,
      (data) => heard.push(data),
    );
    stop();
    send(frame, OPAQUE_ORIGIN, 'after');
    expect(heard).toEqual([]);
  });
});

describe('sending to a frame', () => {
  function fakeFrame() {
    const postMessage = vi.fn();
    return { frame: { postMessage } as unknown as Window, postMessage };
  }

  it('names the origin of a frame that has one', () => {
    const { frame, postMessage } = fakeFrame();
    postToFrame(frame, 'https://draw.example', { a: 1 });
    expect(postMessage).toHaveBeenCalledWith({ a: 1 }, 'https://draw.example', []);
  });

  it('sends to a frame with an opaque origin without naming one', () => {
    const { frame, postMessage } = fakeFrame();
    const buffer = new ArrayBuffer(1);
    postToFrame(frame, OPAQUE_ORIGIN, 'file', [buffer]);
    expect(postMessage).toHaveBeenCalledWith('file', '*', [buffer]);
  });

  it('sends nothing before the frame exists', () => {
    expect(() => postToFrame(null, OPAQUE_ORIGIN, 'x')).not.toThrow();
    expect(() => postToFrame(undefined, OPAQUE_ORIGIN, 'x')).not.toThrow();
  });
});
