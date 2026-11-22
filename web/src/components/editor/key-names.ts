// SPDX-License-Identifier: Apache-2.0
// Keys as the person's own system names them (NAV-067): Cmd and Option on Apple systems,
// Ctrl and Alt elsewhere. A combination is written the way the editor binds it, `Mod-Shift-s`.

/** Whether the keyboard is that of an Apple system, where Mod is the Command key. */
export function isAppleKeyboard(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** The words of each key of a combination such as `Mod-Alt-1`, in the order they are pressed. */
export function keyNames(binding: string, apple: boolean): string[] {
  // The last key may itself be a dash or a comma, so the modifiers are split off one by one.
  const parts: string[] = [];
  let rest = binding;
  for (;;) {
    const dash = rest.indexOf('-');
    if (dash <= 0 || dash === rest.length - 1) break;
    parts.push(rest.slice(0, dash));
    rest = rest.slice(dash + 1);
  }
  const modifier = (name: string) => {
    if (name === 'Mod') return apple ? 'Cmd' : 'Ctrl';
    if (name === 'Alt') return apple ? 'Option' : 'Alt';
    return name;
  };
  const key = rest.length === 1 ? rest.toUpperCase() : rest;
  return [...parts.map(modifier), key];
}

function appleHere(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.userAgent;
  return isAppleKeyboard(platform);
}

/** The keys of a combination for this browser. */
export function keysHere(binding: string): string[] {
  return keyNames(binding, appleHere());
}

/** The value of `aria-keyshortcuts` for a combination in this browser. */
export function ariaKeysHere(binding: string): string {
  return ariaKeys(binding, appleHere());
}

/**
 * The value of `aria-keyshortcuts` for a combination: the names ARIA expects, with Meta on Apple
 * systems and Control elsewhere.
 */
export function ariaKeys(binding: string, apple: boolean): string {
  return keyNames(binding, apple)
    .map((name) => {
      if (name === 'Cmd') return 'Meta';
      if (name === 'Ctrl') return 'Control';
      if (name === 'Option') return 'Alt';
      return name;
    })
    .join('+');
}
