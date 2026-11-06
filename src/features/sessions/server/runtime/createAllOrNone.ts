/**
 * ### createAllOrNone
 *
 * Creates one thing per input, one at a time, then hands them all to
 * `start`; when any creation (or `start`) fails, undoes the ones already
 * created, so a failure leaves nothing behind.
 *
 * A failure to undo one is ignored (that one is left for you to clean up) so
 * the rest are still undone and the original error is the one reported.
 *
 * @returns What `create` returned for each input, in order.
 * @throws Whatever `create` or `start` threw, after undoing.
 */
export async function createAllOrNone<Input, Created>(
  inputs: ReadonlyArray<Input>,
  create: (input: Input, index: number) => Promise<Created>,
  undo: (created: Created) => Promise<void>,
  start: (created: ReadonlyArray<Created>) => void = () => undefined,
): Promise<Array<Created>> {
  const created: Array<Created> = [];
  try {
    for (const [index, input] of inputs.entries()) created.push(await create(input, index));
    start(created);
    return created;
  } catch (error) {
    for (const item of created) await undo(item).catch(() => undefined);
    throw error;
  }
}
