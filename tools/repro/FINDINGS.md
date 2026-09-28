# Two engine bugs behind ~10 crashing LuxAlgo Library indicators

Found while running every indicator the LuxAlgo MCP serves through PineTS (797 sources, 500 bars
each). Both reproduce on `0.10.0`, which is also npm's latest and the repo's HEAD.

I tried to fix the first one; the patch made **6 more test files fail** (7 total, baseline is 1), so I
reverted it rather than ship a change that trades one breakage for another. The failing test is kept
in `tools/repro/drawing-all-arrays.test.ts` — it is RED today and should go green with your choice of
fix. The second bug I could not reduce to a snippet: five of my reductions passed, so I am handing over
the exact generated line and the code location instead of a guess.

---

## Bug 1 — `<drawing>.all` is not a Pine array

TradingView documents `polyline.all` (and `line.all`, `label.all`, `box.all`, `linefill.all`) as
`array<T>`, and `array.size(polyline.all)` is the documented way to count what is on the chart.

```pine
//@version=6
indicator("all")
if barstate.islast
    pl = polyline.new(array.from(chart.point.from_index(0, close)), true)
    plot(array.size(polyline.all), "n")
```

- `array.size(polyline.all)` → `TypeError: id.size is not a function`
- `polyline.all.size()` → `TypeError: polyline.all.size is not a function`
- same for `line.all`, `label.all`, `box.all`

Cause: `PolylineHelper.get all()` returns a **plain `PolylineObject[]`**
(`src/namespaces/polyline/PolylineHelper.ts:211`; same shape in Box/Label/Line/Linefill), while
`array.size` does `id.array.length` on a `PineArrayObject`
(`src/namespaces/array/methods/size.ts`).

Why it stayed invisible: `for pl in polyline.all` **works**, because `Context.iter()` deliberately
accepts both shapes ("built-in returning a plain array (e.g. box.all) or a UDT field holding a
PineArrayObject").

Real-world impact: `money-flow-profile` and `delta-flow-profile` (both in the LuxAlgo Library) die at
their first `array.size(<drawing>.all)` call.

What I tried: return `new PineArrayObject(filtered, PineArrayType.<kind>, this.context)` from each of the
five getters (adding a `polyline` member to `PineArrayType`). `tools/repro/drawing-all-arrays.test.ts`
then passes 4/4, and `delta-flow-profile` runs — **but 6 additional test files fail**, so the shape is
consumed as a plain array somewhere I did not find. The decision is yours: wrap the getters, teach
`array.*` to accept a bare JS array, or keep `.all` plain and document that `array.size()` needs a
`PineArrayObject`.

## Bug 2 — an index that is a variable is emitted as a bare identifier

`money-flow-profile` dies with `ReferenceError: rpLN is not defined`. The generated code for Pine
`b.i[rpLN]` is:

```js
const temp_68 = box.new($.get($.let.glb1_b, rpLN).i, p278, p279, p280, p281, p285);
```

Every other use of `rpLN` in the same file is scoped correctly (`$.get($.let.glb1_rpLN, 0)`), and
`rpLN` is declared as `rpLN = input.int(200, …)` then reassigned with `:=`.

Where to look: `transformArrayIndex()` in `src/transpiler/transformers/ExpressionTransformer.ts`. The
index handling is guarded by

```ts
// Only transform if it's not a context-bound variable
if (!scopeManager.isContextBound(node.property.name)) { … }
```

so an index the analyzer marked context-bound is skipped entirely and reaches the output bare. There is
already a sibling branch for local series vars (the comment about `high[size]` where `size` is a
function parameter), which suggests this is the same shape of problem for a *prop* variable.

I could not reduce it: `close[n]` with `n = input.int(...)`, a plain variable index, an index inside a
loop, and a member object all pass. The failing form in the script is `b.i[rpLN]` — an index on a UDT
**field** access — so that is where I would start.

Same family, other indicators (also `ReferenceError`, also bare identifiers): `get_v is not defined`
(pure-price-action-ict-tools, pure-price-action-liquidity-sweeps, pure-price-action-order-breaker-blocks),
`highs is not defined` (adaptive-momentum-oscillator, trendlines-with-breaks-oscillator), `get is not
defined` (birdies). I checked the obvious guess — a user variable colliding with a runtime helper name —
and it is **not** that: five minimal cases with a variable named `get` all pass.

## Bug 3 — a variable holding a collection is still unwrapped by `$.get(var, 0)`

Why a local patch is not enough, and the most useful thing in this report.

After fixing 1 and 2 (see the candidate commit on this branch: `drawingArray()` + `array.param()` passing
collections through), `delta-flow-profile` **still** dies. Its Pine is:

```pine
allPolylines = polyline.all
for i = 0 to array.size(allPolylines) - 1
    polyline.delete(allPolylines.get(i))
```

and the emitted code is:

```js
$.let.if12_a_allPolylines = $.init($.let.if12_a_allPolylines, polyline.all);
const p123 = array.param($.let.if12_a_allPolylines, undefined, 'p123');
const temp_35 = array.size(p123);                        // now correct
for (let i = 0; … array.size($.get($.let.if12_a_allPolylines, 0)) - 1 …)   // ← dies here
```

`$.get(x, 0)` takes the "forward array access" path in `Context.get()` (`Context.class.ts:806`), so a
variable that holds a collection is read as **its last element** — `array.size(<element>)` then throws
`Cannot read properties of undefined (reading 'size')`. The type inference pass does not carry
"this variable holds `array<T>`" far enough to stop the history wrapper being emitted, so any script that
stores `<drawing>.all` (or any array) in a variable and then passes it to `array.*` breaks — which is the
ordinary way to write this loop.

I stopped there rather than patch `$.get` to sniff collections: the runtime cannot know whether the call
site wanted the collection or its element, so the fix belongs in type inference (or in a marker the
transpiler checks before wrapping). Everything above is measured; this paragraph is where the boundary of
a runtime-only patch is.

---


```bash
npm install
./node_modules/.bin/vitest run tools/repro/drawing-all-arrays.test.ts   # bug 1, currently 4 failed
./node_modules/.bin/tsx <script in this repo's tools/>                  # the source-level probes
```

Environment: `pinets@0.10.0` (repo HEAD and npm latest), Node 26, Linux, 500 synthetic bars,
`symbol=BTCUSDT`, `timeframe=30`.
