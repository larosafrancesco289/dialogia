// Module: tutor serial queue
// Responsibility: run async tasks one after another, each starting once the one before settles.

/** A queue whose tasks never overlap; a failed task does not stop the ones after it. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
