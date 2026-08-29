/**
 * pushable.ts
 *
 * WHAT: An async iterable you can push values into from outside. One of these
 *       is the `prompt` argument of every query() call.
 *
 * WHY IT EXISTS: query() takes either a string or an async iterable. A string
 *       is one prompt and one answer, so a five group interview would be five
 *       spawns, five cold starts and five chances to lose the thread. Passing
 *       an async iterable puts the SDK in streaming input mode, where one
 *       query() object serves the whole conversation and the founder's next
 *       message is pushed into it. That is what makes turn three cost no spawn
 *       and still have turn one's context.
 *
 * CALLED BY: runner.ts. Nothing else should need it.
 * READS:  nothing. WRITES: nothing.
 *
 * The buffer matters. A founder can send while the model is mid answer, and
 * the SDK is not reading at that instant. Dropping that message would lose a
 * founder's sentence, so it is held until the iterator asks for it.
 */

export class Pushable<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void) | null = null;
  private done = false;

  /** Queue one value. Safe to call before anything is iterating. */
  push(value: T): void {
    if (this.done) throw new Error('push after end');
    const waiter = this.waiting;
    if (waiter) {
      this.waiting = null;
      waiter({ value, done: false });
      return;
    }
    this.buffer.push(value);
  }

  /**
   * No more values. The SDK reads this as end of input and shuts the
   * subprocess down cleanly, which is how a session is retired without a kill.
   */
  end(): void {
    if (this.done) return;
    this.done = true;
    const waiter = this.waiting;
    if (waiter) {
      this.waiting = null;
      waiter({ value: undefined, done: true });
    }
  }

  /** How many messages are waiting to be read. For the ops screen. */
  get pending(): number {
    return this.buffer.length;
  }

  get ended(): boolean {
    return this.done;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true });
        }
        // Only one consumer, always: the SDK. A second one would steal
        // messages from the first, so this deliberately does not support it.
        if (this.waiting) throw new Error('Pushable supports one consumer');
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiting = resolve;
        });
      },
      return: (): Promise<IteratorResult<T>> => {
        this.end();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
