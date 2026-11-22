# SPDX-License-Identifier: Apache-2.0
"""Says whether two ARM templates built by Bicep are the same template.

Bicep does not keep the order of a dependsOn list from one run to the next, and its
templateHash follows that order, so the files differ byte for byte while meaning the same.
This compares them with every dependsOn list sorted and the generator's metadata left out.

    python3 same-arm.py built.json committed.json    exit 0 when they are the same
"""

import json
import sys
from typing import Any


def normalised(node: Any) -> Any:
    """Returns node with dependsOn lists sorted and the generator's hash removed."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key == "_generator":
                continue
            if key == "dependsOn" and isinstance(value, list):
                out[key] = sorted(json.dumps(item, sort_keys=True) for item in value)
            else:
                out[key] = normalised(value)
        return out
    if isinstance(node, list):
        return [normalised(item) for item in node]
    return node


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: same-arm.py <built.json> <committed.json>", file=sys.stderr)
        return 2
    templates = []
    for path in sys.argv[1:]:
        try:
            with open(path, encoding="utf-8") as f:
                templates.append(normalised(json.load(f)))
        except (OSError, ValueError) as err:
            print(f"cannot read {path}: {err}", file=sys.stderr)
            return 2
    return 0 if templates[0] == templates[1] else 1


if __name__ == "__main__":
    sys.exit(main())
