/**
 * Which row of a one-open-at-a-time accordion is open after a click.
 *
 * Clicking a closed row opens it and, by replacing the index, closes whichever
 * was open. Clicking the open row closes it, leaving none open.
 */
export function nextOpen(current: number | null, clicked: number): number | null {
  return current === clicked ? null : clicked;
}
