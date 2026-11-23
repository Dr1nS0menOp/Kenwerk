// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { readUserAgent } from './user-agent';

describe('reading a user agent', () => {
  it('reads Chrome on Windows as a computer', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    expect(readUserAgent(ua)).toEqual({
      kind: 'computer',
      system: 'Windows',
      systemVersion: '10',
      program: 'Chrome',
      programVersion: '131',
    });
  });

  it('reads Edge before the Chrome it names', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86';
    expect(readUserAgent(ua)).toMatchObject({ program: 'Edge', programVersion: '131' });
  });

  it('reads the headless Chrome of a test run as Chrome', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.6778.33 Safari/537.36';
    expect(readUserAgent(ua)).toMatchObject({ kind: 'computer', system: 'Linux', program: 'Chrome' });
  });

  it('reads Firefox on Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';
    expect(readUserAgent(ua)).toEqual({
      kind: 'computer',
      system: 'Linux',
      systemVersion: '',
      program: 'Firefox',
      programVersion: '133',
    });
  });

  it('reads Safari on a Mac', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
    expect(readUserAgent(ua)).toEqual({
      kind: 'computer',
      system: 'macOS',
      systemVersion: '10.15.7',
      program: 'Safari',
      programVersion: '18.1',
    });
  });

  it('reads Safari on an iPhone as a phone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    expect(readUserAgent(ua)).toEqual({
      kind: 'phone',
      system: 'iOS',
      systemVersion: '18.1',
      program: 'Safari',
      programVersion: '18.1',
    });
  });

  it('reads Chrome on an Android phone, and an Android tablet', () => {
    const phone =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    expect(readUserAgent(phone)).toEqual({
      kind: 'phone',
      system: 'Android',
      systemVersion: '14',
      program: 'Chrome',
      programVersion: '131',
    });
    const tablet =
      'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    expect(readUserAgent(tablet)).toMatchObject({ kind: 'tablet', system: 'Android' });
  });

  it('reads an iPad as a tablet, and Chrome on iOS as Chrome', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
    expect(readUserAgent(ua)).toEqual({
      kind: 'tablet',
      system: 'iPadOS',
      systemVersion: '17.6',
      program: 'Chrome',
      programVersion: '131',
    });
  });

  it('reads an unknown or empty string as unknown without failing', () => {
    const unknown = { kind: 'unknown', system: '', systemVersion: '', program: '', programVersion: '' };
    expect(readUserAgent('curl/8.5.0')).toEqual(unknown);
    expect(readUserAgent('')).toEqual(unknown);
    expect(readUserAgent('(((')).toEqual(unknown);
  });
});
