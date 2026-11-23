// SPDX-License-Identifier: Apache-2.0
// The device, system and program a session was made with, read from its stored user agent
// (spec 084, ACC-075, D12). A few matches of our own, because a library would be a dependency for
// a small part that nothing relies on; what is not recognised reads as unknown.

export type DeviceKind = 'computer' | 'phone' | 'tablet' | 'unknown';

export interface UserAgentReading {
  kind: DeviceKind;
  /** The operating system, or empty when unknown. */
  system: string;
  systemVersion: string;
  /** The browser or app, or empty when unknown. */
  program: string;
  programVersion: string;
}

interface Pattern {
  name: string;
  match: RegExp;
}

/** Windows names its version by its kernel; 10.0 stands for both 10 and 11. */
const WINDOWS_VERSIONS: Record<string, string> = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' };

// Order matters: a program that builds on another names that one too, so it comes first.
const PROGRAMS: Pattern[] = [
  { name: 'Edge', match: /\bEdg(?:e|A|iOS)?\/(\d+)/ },
  { name: 'Opera', match: /\bOPR\/(\d+)/ },
  { name: 'Samsung Internet', match: /\bSamsungBrowser\/(\d+)/ },
  { name: 'Firefox', match: /\b(?:Firefox|FxiOS)\/(\d+)/ },
  { name: 'Chrome', match: /\b(?:CriOS|HeadlessChrome|Chrome)\/(\d+)/ },
  { name: 'Safari', match: /\bVersion\/(\d+(?:\.\d+)?)[^)]*\bSafari\// },
];

function readSystem(ua: string): Pick<UserAgentReading, 'kind' | 'system' | 'systemVersion'> {
  const dotted = (version: string | undefined) => (version ?? '').replaceAll('_', '.');
  let m = /\biPhone\b.*?\bOS (\d+(?:_\d+)*)/.exec(ua);
  if (m) return { kind: 'phone', system: 'iOS', systemVersion: dotted(m[1]) };
  m = /\biPad\b.*?\bOS (\d+(?:_\d+)*)/.exec(ua);
  if (m) return { kind: 'tablet', system: 'iPadOS', systemVersion: dotted(m[1]) };
  m = /\bAndroid (\d+(?:\.\d+)*)/.exec(ua);
  if (m)
    return { kind: /\bMobile\b/.test(ua) ? 'phone' : 'tablet', system: 'Android', systemVersion: m[1] ?? '' };
  m = /\bWindows NT (\d+\.\d+)/.exec(ua);
  if (m) return { kind: 'computer', system: 'Windows', systemVersion: WINDOWS_VERSIONS[m[1] ?? ''] ?? '' };
  m = /\bMac OS X (\d+(?:[_.]\d+)*)/.exec(ua);
  if (m) return { kind: 'computer', system: 'macOS', systemVersion: dotted(m[1]) };
  if (/\bCrOS\b/.test(ua)) return { kind: 'computer', system: 'ChromeOS', systemVersion: '' };
  if (/\bLinux\b/.test(ua)) return { kind: 'computer', system: 'Linux', systemVersion: '' };
  return { kind: 'unknown', system: '', systemVersion: '' };
}

/** What a user agent string says, as far as it can be read. */
export function readUserAgent(ua: string): UserAgentReading {
  const system = readSystem(ua);
  for (const program of PROGRAMS) {
    const m = program.match.exec(ua);
    if (m) return { ...system, program: program.name, programVersion: m[1] ?? '' };
  }
  return { ...system, program: '', programVersion: '' };
}
