import type { Position } from './types';

/** Map seat index relative to button → named position for 6-max. */
export function positionForSeat(
  seat: number,
  buttonSeat: number,
  seatCount = 6,
): Position {
  const offset = (seat - buttonSeat + seatCount) % seatCount;
  // offset 0 = BTN, 1 = SB, 2 = BB, 3 = EP (UTG), 4 = MP, 5 = CO
  const map: Position[] = ['BTN', 'SB', 'BB', 'EP', 'MP', 'CO'];
  return map[offset] ?? 'MP';
}

export function positionStrength(pos: Position): number {
  const order: Position[] = ['EP', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  return order.indexOf(pos);
}
