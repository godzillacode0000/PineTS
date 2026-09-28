#!/usr/bin/env python3
"""`<drawing>.all`: satisfy BOTH worlds — a plain JS array AND a PineArrayObject.

Attempt 1 returned a PineArrayObject and turned 1 failing test file into 7: the library's own tests
read `line.all.length` (and other array behaviour), which a PineArrayObject does not have.

So return an actual Array that also carries the Pine array behaviour:
  * it IS an array (`.length`, `.filter`, `.map`, indexing — every existing consumer keeps working),
  * `PineArrayObject`'s own fields are grafted onto it, so `array.size(x)` (`x.array.length`) and the
    method form `x.size()` both work,
  * `.array` points at itself, so `Context.iter()`/`entries()` (`Array.isArray(source.array)`) and every
    `array.*` namespace function (which read `id.array`) resolve to the same list.
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

enum_file = ROOT / 'src/namespaces/array/PineArrayObject.ts'
t = enum_file.read_text(encoding='utf-8')
if 'polyline = ' not in t:
    t = t.replace("    linefill = 'linefill',", "    linefill = 'linefill',\n    polyline = 'polyline',", 1)
    enum_file.write_text(t, encoding='utf-8')
    print('enum: added polyline')

    # A helper next to the class, so all five getters share one implementation.
    helper = '''
/**
 * A drawing namespace's `.all` list.
 *
 * TradingView documents these as `array<T>`: `array.size(polyline.all)` is documented usage. A bare JS
 * array made that throw (`id.size is not a function`; `array.size` reads `id.array.length`), while a
 * plain PineArrayObject broke consumers that treat the list as an array (`line.all.length` — the
 * library's own tests do exactly that).
 *
 * So: the array itself, with PineArrayObject's fields grafted on and `.array` pointing at itself.
 */
export function drawingArray<T>(items: T[], type: PineArrayType, context: any): any {
    const obj = new PineArrayObject(items, type, context);
    const list: any = items;
    for (const key of Object.getOwnPropertyNames(obj)) {
        if (key === 'array') continue;                 // handled below
        list[key] = (obj as any)[key];
    }
    list.type = type;
    list.context = context;
    list.array = list;                                  // every array.* function reads id.array
    return list;
}
'''
    t = t.rstrip() + '\n' + helper
    enum_file.write_text(t, encoding='utf-8')
    print('PineArrayObject.ts: added drawingArray()')

for path, obj, kind, field, item in HELPERS:
    p = ROOT / path
    t = p.read_text(encoding='utf-8')
    if 'drawingArray(' in t:
        print(f'{path}: already done')
        continue

    old = re.search(r'    get all\(\): ' + obj + r'\[\] \{\n        return this\.' + field + r'\.filter\(\(\w+\) => !\w+\._deleted\);\n    \}', t)
    assert old, f'{path}: getter not matched'
    new = (
        f'    get all(): {obj}[] {{\n'
        f'        // TradingView documents this as array<{kind}>: array.size({kind}.all) must work, while\n'
        f'        // existing callers treat it as an array (`.length`, .filter). drawingArray() is both.\n'
        f'        return drawingArray(this.{field}.filter(({item}) => !{item}._deleted),\n'
        f'                            PineArrayType.{kind}, this.context);\n'
        f'    }}'
    )
    t = t[:old.start()] + new + t[old.end():]
    if 'drawingArray' not in t.split('\n\n')[0] and "from '../array/PineArrayObject'" not in t:
        lines = t.split('\n')
        last_import = max(i for i, l in enumerate(lines) if l.startswith('import '))
        lines.insert(last_import + 1, "import { drawingArray, PineArrayType } from '../array/PineArrayObject';")
        t = '\n'.join(lines)
    p.write_text(t, encoding='utf-8')
    print(f'{path}: .all is now an array WITH Pine array behaviour')
