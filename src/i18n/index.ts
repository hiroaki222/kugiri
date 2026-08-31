import { ja } from './ja'

export type Strings = typeof ja

/** Japanese is the only locale so far. Adding one means writing a sibling file
 *  that satisfies Strings and choosing it here. */
export const t: Strings = ja
