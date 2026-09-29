// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The array a `<drawing>.all` property returns.
 *
 * Pine documents `polyline.all` (and `line.all`, `label.all`, `box.all`, `linefill.all`) as `array<T>`,
 * and the Library scripts use it as one — `array.size(a)`, `a.get(i)`, `a.size()` — while our own code
 * also hands it around as an ordinary JS array (`for x in a`, `.length`, `.filter`).
 *
 * A plain `T[]` satisfies the second half and fails the first: money-flow-profile died at its first
 * `array.size(<drawing>.all)` call, because the `array.*` wrappers read `id.array` and a plain array
 * has no `.array`. A `PineArrayObject` satisfies the first half and broke six test files when it was
 * tried, because it is not an Array (everything that iterated it, indexed it or compared it to a list
 * changed shape).
 *
 * This subclass is both, which is why it exists: it IS an array (`Array.isArray` → true, every native
 * method intact, JSON-serialises as one) and it carries the Pine surface the scripts call directly,
 * plus the `array` accessor (an array is its own backing store) the `array.*` wrappers read.
 */
export class DrawingArray<T> extends Array<T> {
    /** `array.*` wrappers read `id.array` — for a DrawingArray the store is the array itself. */
    get array(): T[] {
        return this;
    }

    get(i: number): T | undefined {
        return this[i];
    }

    set(i: number, value: T): void {
        this[i] = value;
    }

    size(): number {
        return this.length;
    }

    clear(): void {
        this.length = 0;
    }

    remove(i: number): void {
        if (i >= 0 && i < this.length) this.splice(i, 1);
    }

    insert(i: number, value: T): void {
        this.splice(Math.max(0, Math.min(i, this.length)), 0, value);
    }

    indexof(value: T): number {
        return this.indexOf(value);
    }

    lastindexof(value: T): number {
        return this.lastIndexOf(value);
    }

    first(): T | undefined {
        return this[0];
    }

    last(): T | undefined {
        return this[this.length - 1];
    }

    copy(): DrawingArray<T> {
        return DrawingArray.from(this);
    }

    sum(): number {
        return this.reduce((acc: number, v: any) => acc + (typeof v === 'number' ? v : 0), 0);
    }

    avg(): number {
        return this.length ? this.sum() / this.length : NaN;
    }

    min(): number {
        const nums = this.filter((v: any) => typeof v === 'number') as unknown as number[];
        return nums.length ? Math.min(...nums) : NaN;
    }

    max(): number {
        const nums = this.filter((v: any) => typeof v === 'number') as unknown as number[];
        return nums.length ? Math.max(...nums) : NaN;
    }

    /** Pine's `array.push` returns the array's new size; the native one already does. */
    static of<T>(...items: T[]): DrawingArray<T> {
        return super.of(...items) as DrawingArray<T>;
    }

    /** Build from any iterable — the door the drawing helpers use. */
    static from<T>(items: Iterable<T> | ArrayLike<T>): DrawingArray<T> {
        const out = new DrawingArray<T>();
        for (const item of Array.from(items as ArrayLike<T>)) out.push(item as T);
        return out;
    }
}
