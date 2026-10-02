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

RESOLVED (29 Sep). Stage 1 emitted `const fib = Type({…})` AND `var fib = fib.new(…)` — two
declarations of one identifier. The type now moves aside (`fib_$T<n>`) through its own map
(`typeRenameMap`), followed by type references only: the TypeDefinition name, annotation strings and
`X.new(…)` call sites. The variable keeps its name.

Two details that cost a round each, both measured:

* **Only `.new` may follow the rename.** A draft that followed every `fib.` renamed the FIELD read
  too, and `plot(fib.p)` then plotted the type object instead of the field.
* **Two guards had to widen**, or the rename never ran where it mattered: the rename pass is invoked
  when `renameMap.size > 0 || typeRenameMap.size > 0` (a type-only rename left it empty), and a
  function body is walked for the same reason — a UDT instance declared inside a function kept the
  old type name in its `__pineTypedVar:` marker.

`tests/transpiler/udt-name-shadow.test.ts` (4 cases: declaration, non-var instance, field values,
annotation inside a function) — all 4 fail on the pre-fix sources. Live: `fibonacci-trailing-stop`
and `open-interest-chart` now run on the chart.

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

### FIXED — and six of the fourteen are a SECOND shape

The cause was in `transformExpression`'s own `MemberExpression` visitor: it recursed only into
**Identifier** objects (`if (node.object.type === 'Identifier' …)`), so the base of a chain whose
object is itself a member call — `get_v.get(1).y` — was never visited. The fix mirrors
`MainTransformer`'s visitor: recurse into `MemberExpression` / `CallExpression` objects first.
`tests/transpiler/comparison-member-chain.test.ts` (3 cases; all 3 fail on the pre-fix sources; both
the true and the false branch are pinned so a fix that only stops the crash is caught).

Measured on real bars, the fix turns SEVEN of the class green: `pure-price-action-ict-tools`,
`pure-price-action-liquidity-sweeps`, `pure-price-action-order-breaker-blocks`,
`adaptive-momentum-oscillator`, `birdies`, `session-gap-fill`,
`trendlines-with-breaks-oscillator` (the `get_v` / `highs` / `get` / `gaps` names).

The rest die on a DIFFERENT shape, same family — a **non-computed** UDT field access whose object
identifier is emitted bare. `market-structure-targets-model`, real bars, generated line 682:

```js
} else if ($.pine.math.__eq(MSS.dir, 1) && …)     // MSS bare — while the SAME chain 8 lines later is
                                                   // $.get($.var.glb1_MSS, 0).<field>
```

and the same pattern in `ichimoku-theories` (`timeCycles`), `ict-concepts` (`bsNOTbodyUP`),
`periodic-activity-tracker` (`lastBar`), `probability-grid` (`currentPivot`) and
`volume-bubbles-liquidity-heatmap` (`x`).

### RESOLVED (1 Oct) — two walkers that transformed the node and never recursed

The answer WAS in a walker, but not in the identifier's guards the hypotheses pointed at. A trace
(`PINETS_DEBUG_IDENT`) showed `transformMemberExpression` being reached for `MSS.dir` while
`transformIdentifier` never saw `MSS` at all — the visitor had transformed the node and stopped. Two
walkers did exactly that, and between them they own every failing site in this class:

1. **a method's implicit return**, where a `switch` lives. Its arm tests are comparisons full of
   member chains — and `transformCallExpression` scopes the CALL chains beside a member read, which
   is why `aZZ.y.get(iH)` looked fine in the same expression while `MSS.dir` stayed bare.
2. **a returned tuple** — `[lastBar.buy, lastBar.sell]`: that branch called
   `transformMemberExpression` and returned the element untouched, with no walker at all.

Both now share one visitor set (`tupleExpressionVisitors`) that scopes a chain's base, skipping
context-bound namespace objects — the pattern every other member visitor in the file already used.
`tests/transpiler/implicit-return-member-base.test.ts`: 4 cases (generated-code signature + runtime),
all 4 failing on the parent commit in a worktree, all 4 passing after.

Measured offline on the fork's fixtures — these now RUN: `market-structure-targets-model` (444 labels
+ 500 lines), `probability-grid` (100 boxes + 500 labels + 20 lines), `periodic-activity-tracker`
(8 boxes + 4 labels + 5 series). Live on the chart: `market-structure-targets-model` runs in 829 ms
and paints 7 lines + 7 labels, read back on screen.

**Then-failing, now split:** `ichimoku-theories` (`timeCycles`) and `ict-concepts` (`bsNOTbodyUP`)
were RESOLVED by patch 6 (below); `volume-bubbles-liquidity-heatmap` (`x`) turned out to be a
different bug — a declaration-scope defect, diagnosed at the end of this file.

### RESOLVED (1 Oct, patch 6) — two more operands no walker descended into

Both only bite through the `*.param(...)` wrapper, which is why simplifications kept running:

- **An index that is itself a read** (`high[nId[1]]`): the array-access branch of the argument lowerer
  handled an Identifier index and a binary/unary/logical/conditional one and fell through to "use the
  node untouched" for everything else, so nothing scoped the base of `nId[1]` — ict-concepts'
  `lwst = math.min(lPh[bsNOTbodyUP[1]], low[bsNOTbodyUP[1]])`
  (`ReferenceError: bsNOTbodyUP is not defined`). Fix: `transformIndexExpression` lowers a member (and
  a call) index too.
- **A call that is the OBJECT of a member chain** (`array.first(timeCycles).firstBarIndex`): the
  walker visitor in the operand path replaces the base descent (it transforms the call, never
  recursing), so the call's arguments were never walked — ichimoku-theories'
  `lowest := ta.lowest(bar_index - array.first(timeCycles).firstBarIndex) - atr200`
  (`ReferenceError: timeCycles is not defined`). Fix: the operand path transforms a CallExpression
  object before using it.

`tests/transpiler/index-and-call-operands.test.ts` (4 cases; all 4 fail on the parent commit — the two
runtime cases with those two ReferenceErrors — all 4 pass after). Both scripts run offline
(ichimoku-theories: 24 labels + 27 lines + 10 polylines; ict-concepts: 4 labels + 20 lines + 12 boxes)
and both are verified live on the chart.

**Five of the class's six scripts now run.** The sixth, `volume-bubbles-liquidity-heatmap`, is a
DIFFERENT bug — next target, and the diagnosis is already in hand (see below).

### RESOLVED (1 Oct, patch 7) — a declaration reached by a walker now keeps its scope and store

`volume-bubbles-liquidity-heatmap` died with `ReferenceError: x is not defined` in `drawLabel`:

```pine
    [labelPoint, labelStyle] = switch switchData
        TOP =>
            [x, y] = coordinates(anchorBar, anchorPrice, angle, radiusBar, radiusPrice)
            [chart.point.new(na,x,y),label.style_label_down]
```

The diagnosis below was right about the symptom and wrong about the cure. The block is real, but the
reason it mattered is that the split declarations never went through the STANDARD lowering: the
statements of a switch arm are reached by a WALKER (the implicit return's when the switch is a
function's last statement, the declaration-init's when the switch is the value of a destructuring) and
those walkers visited identifiers and calls but never a VariableDeclaration. So the arm kept

```js
              let temp_1 = $.call(coordinates, "_fn0", …);   // a JS local, in an inner block …
              let x = $.get($.let.temp_1, 0);                // … read from a store nothing wrote
```

Both walkers now route a declaration to `transformVariableDeclaration`, so the arm's names land in the
context store with their scope prefix — `$$.let.fn4_x = $.init($$.let.fn4_x, …)` — the shape every
other declaration gets and one a block cannot hide.

`tests/transpiler/tuple-in-switch-arm.test.ts` (4 cases, BOTH walkers; all 4 fail on the parent commit
with `ReferenceError: a is not defined`). The script runs offline (158 boxes + 100 labels + 83 lines +
100 polylines over 16,560 bars) and live on the chart (984 ms, 7 boxes + 5 lines + 7 labels + 4 series
paths, read back on screen). **That closes the six-script class: all six run.**

**The first cut of this fix was too broad, and the suite caught it** (25 failed against the 16
baseline): routing EVERY declaration reached by those walkers to `transformVariableDeclaration` also
lowered an IIFE's own plain JS locals — a loop-as-expression's accumulator (`let __result;` +
`__result = [i, i*2]` inside the loop + `return __result`) became `$.let.x = undefined`, and the reads
answered NaN (`tests/transpiler/tuple-parity.test.ts`, the runtime half of `parser-fixes.test.ts`).
Both visitors now route ONLY what the AnalysisPass's ArrayPattern split produced — the temp (marked
`_tupleArity`) and the pattern elements — and a `for` header declaration is flagged and left alone so
the header cannot be garbled (`SyntaxError: Unexpected token ';'`). Commit `073fbaa`.

**A second trap in the same fix** (`b001bed`): a custom visitor in acorn-walk's `walk.recursive`
REPLACES the default descent rather than running beside it, so the narrowed visitor stopped the walk
from reaching a declaration's initializer — `let e = src + 1` kept `src` bare
(`tests/transpiler/switch-and-declaration-parsing.test.ts`). Both visitors now walk the init
themselves, and never the id: the base visitor visits a declarator's id as a `Pattern`, and walking it
as an Identifier emitted an invalid `let $.get(e, 0) = …` (`SyntaxError: Unexpected token '.'`). With
that, the six affected files are 166/166 and the suite is back at its 16-failure baseline.

#### The original diagnosis, kept for the record

`volume-bubbles-liquidity-heatmap` dies with `ReferenceError: x is not defined` in `drawLabel`:

```pine
        TOP =>
            [x, y] = coordinates(anchorBar, anchorPrice, angle, radiusBar, radiusPrice)
            [chart.point.new(na,x,y), label.style_label_down]
```

Stage 1 emits this correctly (`case 'TOP': { let [x, y] = coords(...); return [...]; }`) — the damage
is in **Stage 2's ArrayPattern split**, `AnalysisPass.ts` (~line 654): the declaration node is replaced
IN PLACE by

```ts
                    Object.assign(node, { type: 'BlockStatement', body: [tempVarDecl, ...individualDecls] });
```

so the lowered `let x` / `let y` land in a NEW lexical block while the statements that use them (here
the arm's return) stay in the enclosing one. Two further defects in the same function-local path, both
visible in the emitted code — the temp is a plain JS local while the readers are pointed at the context
store:

```js
              let temp_1 = $.call(...);            // written to a JS local …
              let x = $.get($.let.temp_1, 0);      // … but read from $.let.temp_1 (never assigned)
```

At global scope the same split works because the elements become `$.let.glb1_x = $.init(...)` (context
store), which a nested block cannot hide. So the fix has to (a) keep the declarations in the scope that
uses them — splice them into the parent statement list (or mark the synthetic block and flatten it in
the Stage-2 walkers) — and (b) make the temp's writer and readers agree on one store. Repro:
`tools/repro/src/tuple-in-switch-arm.pine`, plus the real script; no fix, no partial fix, and above all
no `[x, y]` simplification that passes — the shape only breaks inside a FUNCTION with a switch arm.

#### For the record — the three hypotheses falsified on 29 Sep (superseded, kept so they are not retried)

All six still fail after the four shipped patches; each of these was measured and can be skipped:

1. **"It is the UDT name shadow"** — no: in `market-structure-targets-model` the TYPE is lowercase
   `mss` and the VARIABLE is uppercase `MSS`, i.e. two different identifiers; the registry keys are
   exact names (`ScopeManager` has no `toLowerCase`). A repro of that exact pair scopes correctly.
2. **"It is an `else if`"** — the failing line IS an `else if (MSS.dir == 1 && close > …)`, but
   `tools/elseif-bare-repro.mjs` shows `else if` inside a `method`, at top level, and a plain `if` all
   scoped.
3. **"It is the logical `&&`"** — the logical visitor recurses into both operands; no difference in the
   repros.

What is still different about the real site and NOT in any repro: the condition is
`MSS.dir == 1 && close > aZZ.y.get(iH)` inside `$M_draw`, where the RIGHT operand is itself a member
chain ending in a CALL argument (`aZZ.y.get(iH)`, with `iH` a function-scope local: `$$.let.fn8_iH`).
Next: build the repro around BOTH sides being member chains inside one `and` in a method, and instrument
`transformIdentifier` for the `MSS` node (print `isContextBound`, `isUdtTypeName`, the scope type and
whether `_skipTransformation` is set) — the three falsified hypotheses above say the answer is in the
identifier's own guards, not in the walker.

## Bug 8 — a UFCS method call on a LITERAL receiver (`'none'.box(obj)`)

`breakout-detector-previous-mtf-high-low-levels` dies with `"none".box is not a function`. The source
calls a user method through UFCS on a string literal:

```pine
method box(string s, Tbreak obj) => …      // line 73
…
'none'.box(bxBtmBreak)                     // lines 242 and 313
```

and the emitted line keeps a member call on the literal:

```js
('none').box($.get($.var.glb1_bxBtmBreak, 0));      // generated line 841
```

Mechanism, from `transformCallExpression`'s dispatch block (ExpressionTransformer.ts, ~1798-1870): the
receiver's static type is derived from `_obj.name` (Identifier / `$.get`-wrapped) or from a UDT field
chain — a **Literal** receiver has no name, so `receiverBaseType` stays undefined. The
unknown-receiver fallback (`dispatchOnUnknownReceiver`) is then disabled precisely because `box` IS in
`BUILTIN_METHOD_NAMES` (`box.new`, `box.delete`…), so nothing retargets the call and it stays
`("none").box(...)`.

Proposed fix (small): give a Literal receiver its Pine type before the dispatch decision —
`'…' → 'string'`, integer → `'int'`, other numbers → `'float'` — so `receiverTypeMatches` can fire
against `method box(string s, …)`.

**Reduction NOT achieved yet — measure before trusting the paragraph above.** `tools/ufcs-literal-repro.mjs`
(a `'none'.box(b)` call plus a UDT-receiver call, same file) RUNS, and `tools/ufcs-literal-repro2.mjs`
shows the same call working at top level, inside an `if`, and inside a switch arm. The real call sites
(lines 242, 313) sit in a switch whose arms contain a NESTED switch and comma-joined statements, so the
trigger is probably that context (or the method's registration order at that point in the file), not the
literal receiver alone. Note also that the variant with the call as a switch ARM VALUE dies in the
parser with `Multiple default clauses (17:4)` — a separate bug in switch parsing, worth its own repro.

Note the same script has a SECOND mis-lowering on lines 845-846 —
`$.param('btm', $.get($.get($.get($.get(undefined, 0), 0), 0), 0), 'p233')` — a receiver turned into
`undefined` inside a deeply nested `$.get`; that is a separate shape, not this one.

### RESOLVED (patch 8, `ba5aa4c`): the name-collision class, found by the audit's #26

The audit flagged `isArrayPatternElement` as "a set of NAMES across the whole program — a same-named
IIFE local will be lowered", with no test. Writing that test found the defect was LIVE, not
theoretical:

```pine
split() => [x, y] = ...        // makes `p` an array-pattern element, program-wide
[p, q] = split()
w = switch
    p > 0 =>
        p = close[1]           // a USER local that shares the element's name
        p + 1
```

`close[1]` in a declaration IS a computed member expression, so the shape heuristic at the lowering
did not save it — it was treated as a tuple element and became
`$.get($.let.close, 0)[1]` (a tuple read of the wrong store), throwing
`TypeError: Cannot read properties of undefined (reading '1')` at runtime. Measured on `073fbaa`.

Fix: the AnalysisPass marks the declarators its own split built (`_arrayPatternSplit`), the
transformers match that marker instead of the name set, and the walkers additionally route a
declaration that REASSIGNS a name the context already knows (an arm's `p = 10` must land in the outer
store) while a fresh IIFE local stays a plain JS local. `tests/transpiler/tuple-element-name-collision.test.ts`
(4 cases; the history-read pair fails on `073fbaa`, 2/4). The six scripts of the bare-member class all
still run, and the suite sits at its baseline (`16 failed | 2538 passed`).

**Open question that test deliberately does not assert (the audit's follow-up, 2 Oct).** With patch 8's
rule, the arm's `p = 10` writes the store the outer readers use: offline, the global `p` reads 10
afterwards, and `p = close[1]` reads the previous close. Whether Pine v6 does that or **shadows** (a
`=` in a local block declaring a new local, so the outer `p` keeps 1) is exactly what needs a
TradingView run — and the engine is not consistent about it either, which round 3 measured: the normal
pipeline gives `if`, `else` and `for` blocks their own scope types (`ScopeManager.addVariable` →
`if1_p`, `for1_p`), so the same declaration there gets its own store, while only the switch-arm walkers
push no scope and patch 8's rule sends a known name to the enclosing store. So the write-through is
specific to that walker path, not engine-wide — the earlier entry here overstated it. The test now
asserts only what holds under either reading (`w`, `u`, and the absence of the tuple-read shape) and
two of its four cases (the history-read pair) fail on `073fbaa`. Check `plot(p)` for
`tools/repro/src/name-collision.pine` on TradingView before relying on either number.

