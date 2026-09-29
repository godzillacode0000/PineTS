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

## Bug 4 — a variable that shares its User Defined Type's name

Three Library indicators die with `Identifier 'X' has already been declared` — `fibonacci-trailing-stop`
(`fib`), `open-interest-chart` (`values`), `support-resistance-classification-vr` (`lab`).

Minimal repro (`tools/udt-shadow-repro.mjs`, 2 cases, one passes):

```pine
//@version=6
indicator("udt-shadow")
type fib
    float p
var fib fib = fib.new(1.0)      // ← variable named like its type
plot(fib.p)
```

* this → `SyntaxError: Identifier 'fib' has already been declared (4:4)` (acorn, parsing the generated JS)
* renaming the instance (`var fib inst = fib.new(1.0)`) → **runs, 97 series** — so the type declaration and
  the variable declaration are emitted under the same name, and only the collision breaks it.

The real script is exactly this shape: `type fib` on line 41, `var fib fib = fib.new(…)` on line 60.

Where to look: `renameConflictingVariables()` / `collectConflictingVarNames()` in
`src/transpiler/pineToJS/codegen.ts`. There is already a rename for a UDT named with a JS reserved word
(`type new` → `new_$N`, tracked in `renamedTypeNames` and followed at annotation and call sites) — this is
the same problem with a different trigger, so the mechanism is there.

Why I did not land a fix: both directions are ambiguous at a reference site. Renaming the TYPE means
`renameVariableRefsInAST` may follow the rename for the *instance* references too (`fib.lf_0` is a field
access on the instance, `fib.new()` is a type call), and renaming the INSTANCE has the mirror problem.
Pine keeps the two in separate namespaces; the fix needs the reference resolver to say which namespace a
given `fib` belongs to, and a wrong guess silently rewires field access rather than failing loudly. That is
a change to make with the suite in front of you, not while a session is running out.

## Resolved — `syminfo.param is not a function` (2 indicators): NOT an engine bug

`relative-strength-scatter-plot` and `smt-divergences` die on the generated line

```js
const p245 = syminfo.param($.let.glb1_symA, undefined, 'p245');
```

from Pine `syminfo.ticker(symA)` (line 218 of the first script). The transpiler read that call as
UFCS-style and picked `syminfo` as the namespace owning `param`, so the argument wrapper was emitted as
`syminfo.param(...)` — a method `syminfo` does not have.

Resolved: `syminfo.ticker` is a **variable** of type `simple string`, not a function (Pine reference, mirrored
at codenamedevan/pinescriptv6 — "Type: simple string · See also: ticker.new()"). The scripts call it with an
argument, which is a compile error on TradingView too, so these two are the scripts' own defect and the
engine-bug count drops by two. Nothing to fix here.

## Bug 5 — `var` UDT instance + a field history read (the largest class: 14 indicators)

Minimal repro (`tools/field-history-repro.mjs`, 4 cases): `b.c[1]` runs, `b.c[n]` dies with
`n is not defined`, `close[n]` runs — the fault is specific to a history read on a UDT **field**.

```pine
//@version=6
indicator("field-history")
type bar
    int i
    float c
var bar b = bar.new(bar_index, close)
n = input.int(5, minval = 1)
plot(b.c[n])            // → ReferenceError: n is not defined
```

Generated: `plot.any($.get($.var.glb1_b, n).c, …)` — the index is left bare, and the history read is
applied to the OBJECT.

`transformMemberExpression` does this on purpose — its comment (ExpressionTransformer.ts, the branch at
"Subscript on a UDT-field chain") states the premise:

> `bar.low[N]` reads bar's `.low` from N bars ago. Since `bar = BAR.new()` runs every bar,
> `$.let.glb1_bar` is a Series of PineTypeObject instances → `$.get(glb1_bar, N).low` is correct.

That premise holds only when the instance is re-created every bar. With **`var bar b = bar.new(…)`** the
object is created ONCE, so `$.get(b, N)` reads the variable's own history (the same object) and `.c`
yields today's value — silently wrong numbers, not a crash. money-flow-profile uses `var` (line 60 of
fibonacci-trailing-stop is the same shape), and the same class covers the `get_v` / `highs` failures in
the other Pure Price Action scripts.

RESOLVED (29 Sep) — both halves are fixed and measured:

* The INDEX is transformed at the call site now (`transformIndexExpression`), so `b.i[rpLN]` no longer
  emits a bare identifier (`ReferenceError: rpLN is not defined`).
* A `var` instance reads the FIELD's history: the branches ask the scope manager for the declaration
  kind (`getVariable(name)[1] === 'var'`) and accumulate `$.get(<base>, 0).field` per bar with
  `$.param`, then look N back (`udtFieldHistory`). A per-bar instance keeps the old shape
  (`$.get(<base>, N).field`) — the engine stores a NEW object every bar, so that read is already the
  field as of N bars ago.

Values are checked against the SOURCE, not against the engine: with `b.c := close` on every bar,
`b.c[1]` must equal `close[1]` — measured equal, and NOT equal to the current value (which is exactly
what the bug produced). `tests/transpiler/udt-field-history.test.ts` carries four cases (var /
variable index / reassigned index / per-bar guard); three of them fail on the pre-fix sources.
Suite: 16 failed | 2508 passed before and after — the baseline (the known
`tests/core/pinescript.test.ts` failures) is unchanged.

## Bug 6 — drawing constructors are called, but the rows never land (the "0 series" bucket)

The console reports "containers declared but the engine stored NO rows" for scripts that the sweep filed
as "0 series". That message was ambiguous, so `tools/ctor-count.mjs` patches the drawing helper's
prototype BEFORE the engine is built and counts the calls, then reads the container rows after the run:

| script | box.new calls | rows in `__boxes__` |
|---|---|---|
| 1-2-3-reversal | 0 | 0 — its own conditions never fired (legitimate) |
| 5-0 | 0 | 0 — same |
| abcd | **12** | 3 placeholder rows — nothing drawable |
| 8am-1h-range-breaks | **137** | 3 placeholder rows — nothing drawable |

First reading was WRONG and is corrected here: a container is an OBJECT (`{title, data, …}`), so counting
its keys said "3 rows" while the real row count is `data.length`. Reading `.data` shows **1 row for every
container — and that single row packs every box the script built** (BoxHelper flushes `.data = [{ … }]`,
a snapshot of the live objects, not a history). So the engine does NOT drop the drawings: 12 boxes for
`abcd` and 137 for `8am-1h-range-breaks` are all inside that one row.

The loss happens in OUR worker path: the console runs scripts in a Worker, and what comes back is counted
as 0 rows by the runner, which is why the panel says "the engine stored NO rows" and the overlay stays
empty. That is a plugin-side bug, not an upstream one — and it is the same practical outcome the operator
sees as "the indicator does not appear".

Next: `_createBox` (BoxHelper.ts, reached from `new()`) is where the object is stored — trace whether the
row is written to the container the runner reads, or to a per-scope key the runner never looks at.

## Bug 7 — a comparison operand's member chain is never transformed (the `X is not defined` class)

The biggest remaining class in the live sweep: 14 library scripts die with `ReferenceError: <name> is
not defined` where `<name>` IS declared and IS scoped everywhere else in the same function (`get_v` ×3
in the Pure Price Action set, plus `highs`, `get`, `timeCycles`, `bsNOTbodyUP`, `MSS`, `lastBar`,
`currentPivot`, `gaps`, `pivH`, `lows`, `x`).

Minimal repro (`tools/bisect2.mjs`, the `global if` case — six lines, reproduces at top level):

```pine
//@version=6
indicator("b2")
type SWING
    float x
    float y
get_v = array.from(SWING.new(1.0, 2.0))
pivot = get_v.get(0).y
if pivot == get_v.get(1).y
    plot(pivot)
```

emits `if ($.pine.math.__eq($.get($.let.glb1_pivot, 0), get_v.get(1).y))` — the LEFT operand is scoped,
the RIGHT operand's chain is RAW.

Bisect (`tools/bisect-bare-ident.mjs`): the trigger is the comparison operand being a member chain that
ENDS in a UDT field access (`.y`). The same chain without the field (`pivot == get_v.get(1)`) is scoped;
the same chain as an assignment RHS or as a call argument is scoped.

Measured with env-guarded prints (since removed): `transformExpression` IS called with the if-test
(`root= BinaryExpression … right= MemberExpression`), but its `MemberExpression` visitor is never hit
for that operand — the walker does not descend into the right operand in this shape, so
`transformMemberExpression` (and the UDT machinery in it) never sees the chain. `pivot`, an Identifier
operand, is scoped by the Identifier visitor's `addArrayAccess` path — which is why exactly one side of
the same comparison is correct.

Next step: instrument the `BinaryExpression` visitor of `transformExpression`
(`src/transpiler/transformers/StatementTransformer.ts`, the `c(node.right, state)` call) and print the
operand's type at that moment — the shape suggests the LEFT operand's transformation replaces the
parent in place (`Object.assign`), so the following `c(node.right, state)` may be reading a mutated
node.

