#!/usr/bin/env python3
"""Make `<drawing>.all` a Pine array, as TradingView documents it.

`array.size(polyline.all)` is documented usage and fails today with `id.size is not a function`: the
getters return a bare JS array while `array.*` expects a PineArrayObject (`.array` + methods).

Safe to change: `Context.iter()`/`entries()` already handle BOTH shapes ("built-in returning a plain
array (e.g. box.all) or a UDT field holding a PineArrayObject"), and `[Symbol.iterator]` exists on
PineArrayObject, so `for x in <drawing>.all` keeps working.
"""
import pathlib
import re

ROOT = pathlib.Path('.')
HELPERS = [
    ('src/namespaces/box/BoxHelper.ts', 'BoxObject', 'box', '_boxes', 'b'),
    ('src/namespaces/label/LabelHelper.ts', 'LabelObject', 'label', '_labels', 'l'),
    ('src/namespaces/line/LineHelper.ts', 'LineObject', 'line', '_lines', 'l'),
    ('src/namespaces/linefill/LinefillHelper.ts', 'LinefillObject', 'linefill', '_linefills', 'lf'),
    ('src/namespaces/polyline/PolylineHelper.ts', 'PolylineObject', 'polyline', '_polylines', 'pl'),
]

# 1. The enum has no `polyline` member.
enum_file = ROOT / 'src/namespaces/array/PineArrayObject.ts'
t = enum_file.read_text(encoding='utf-8')
if 'polyline = ' not in t:
    t = t.replace("    linefill = 'linefill',", "    linefill = 'linefill',\n    polyline = 'polyline',", 1)
    enum_file.write_text(t, encoding='utf-8')
    print('enum: added polyline')

# 2. Each helper returns a PineArrayObject.
for path, obj, kind, field, item in HELPERS:
    p = ROOT / path
    t = p.read_text(encoding='utf-8')
    if 'PineArrayObject(' in t and 'get all(): PineArrayObject' in t:
        print(f'{path}: already done')
        continue

    old = re.search(r'    get all\(\): ' + obj + r'\[\] \{\n        return this\.' + field + r'\.filter\(\(\w+\) => !\w+\._deleted\);\n    \}', t)
    assert old, f'{path}: getter not matched'
    new = (
        f'    get all(): PineArrayObject {{\n'
        f'        // TradingView documents this as `array<{kind}>`, and `array.size({kind}.all)` is the\n'
        f'        // documented way to count what is on the chart: a bare JS array made that throw\n'
        f'        // `id.size is not a function`. Context.iter()/entries() accept both shapes, and\n'
        f'        // PineArrayObject is iterable, so `for x in {kind}.all` is unaffected.\n'
        f'        return new PineArrayObject(this.{field}.filter(({item}) => !{item}._deleted),\n'
        f'                                    PineArrayType.{kind}, this.context);\n'
        f'    }}'
    )
    t = t[:old.start()] + new + t[old.end():]

    if 'PineArrayObject' not in t.split('\n\n')[0] and "from '../array/PineArrayObject'" not in t:
        lines = t.split('\n')
        last_import = max(i for i, l in enumerate(lines) if l.startswith('import '))
        lines.insert(last_import + 1, "import { PineArrayObject, PineArrayType } from '../array/PineArrayObject';")
        t = '\n'.join(lines)
    p.write_text(t, encoding='utf-8')
    print(f'{path}: .all now returns a PineArrayObject')
