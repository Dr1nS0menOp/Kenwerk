// SPDX-License-Identifier: Apache-2.0
// A secret the server never shows again (spec 098, spec 101): the field says whether one is set,
// and the choice beside it keeps it, sets a new one or removes it.
import { Field } from './ui';

/** What a change does with a stored secret; only `set` carries a value. */
export type SecretChange = { action: 'keep' } | { action: 'remove' } | { action: 'set'; value: string };

/** The words of one secret, such as those of a password or a client secret. */
export interface SecretWords {
  label: string;
  isSet: string;
  notSet: string;
  keep: string;
  none: string;
  change: string;
  remove: string;
  newValue: string;
}

export function SecretField({
  words,
  isSet,
  value,
  disabled,
  onChange,
}: {
  words: SecretWords;
  isSet: boolean;
  value: SecretChange;
  disabled: boolean;
  onChange: (next: SecretChange) => void;
}) {
  return (
    <>
      <Field label={words.label} help={isSet ? words.isSet : words.notSet}>
        <select
          value={value.action}
          disabled={disabled}
          onChange={(e) => {
            const action = e.target.value;
            onChange(
              action === 'set'
                ? { action, value: '' }
                : action === 'remove'
                  ? { action }
                  : { action: 'keep' },
            );
          }}
        >
          <option value="keep">{isSet ? words.keep : words.none}</option>
          <option value="set">{words.change}</option>
          {isSet && <option value="remove">{words.remove}</option>}
        </select>
      </Field>
      {value.action === 'set' && (
        <Field label={words.newValue}>
          <input
            type="password"
            autoComplete="new-password"
            value={value.value}
            onChange={(e) => onChange({ action: 'set', value: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}
