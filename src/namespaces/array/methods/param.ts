// SPDX-License-Identifier: AGPL-3.0-only

import { Series } from '../../../Series';

export function param(context: any) {
    return (source: any, index: number = 0) => {
        if (source == null) return source;
        /* A COLLECTION argument must pass through untouched.
         *
         * The transpiler wraps every argument of a namespace call in `array.param(...)`, which is
         * right for a series (take the current bar's value) and wrong for a collection: `array.size(x)`
         * wants `x`, not its first element. Measured with `array.size(polyline.all)` — the argument
         * arrived as `undefined` (an empty list unwrapped to nothing) or, worse, as the first polyline,
         * so the call threw `id.size is not a function` on documented TradingView usage.
         */
        if (Array.isArray(source) || Array.isArray(source?.array)) return source;
        return Series.from(source).get(index);
    };
}

