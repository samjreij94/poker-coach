import { describe, expect, it } from 'vitest';
import { botAction, type BotContext } from '../bots';
import { parseCards } from '../cards';
import type { BotStyle, PlayerState } from '../types';

const BOT_STYLES: BotStyle[] = ['tight', 'lag', 'callingStation'];

function ctx(
  style: BotStyle,
  hole: string,
  board: string,
  opts: Partial<Omit<BotContext, 'player' | 'board'>> & { betThisStreet?: number } = {},
): BotContext {
  const player: PlayerState = {
    id: 1,
    name: 'Bot',
    style,
    stack: 190,
    holeCards: parseCards(hole),
    betThisStreet: opts.betThisStreet ?? 0,
    totalInvested: 10,
    folded: false,
    allIn: false,
    isHero: false,
    seat: 1,
  };
  const street = opts.street ?? (board ? (['flop', 'turn', 'river'] as const)[parseCards(board).length - 3]! : 'preflop');
  return {
    player,
    players: [player],
    board: board ? parseCards(board) : [],
    street,
    pot: opts.pot ?? 20,
    toCall: opts.toCall ?? 0,
    minRaise: opts.minRaise ?? 2,
    buttonSeat: opts.buttonSeat ?? 0,
    currentBet: opts.currentBet ?? 0,
    bigBlind: opts.bigBlind ?? 2,
  };
}

/** Preflop, facing an open to $6 ($2 BB); bot has nothing in yet. Pot = 1 + 2 + 6. */
function facingRaise(style: BotStyle, hole: string): BotContext {
  return ctx(style, hole, '', { pot: 9, toCall: 6, currentBet: 6, minRaise: 4 });
}

describe('bot folds: clearly beaten preflop', () => {
  it.each(BOT_STYLES)('%s folds junk (7-2 offsuit, 9-3 offsuit) to a raise', (style) => {
    expect(botAction(facingRaise(style, '7c2d')).type).toBe('fold');
    expect(botAction(facingRaise(style, '9s3h')).type).toBe('fold');
  });

  it('calling station still plays a weak ace or a small pair against a raise', () => {
    expect(botAction(facingRaise('callingStation', 'Ah5d')).type).not.toBe('fold');
    expect(botAction(facingRaise('callingStation', '2c2d')).type).not.toBe('fold');
  });

  it('strong hands never fold to a raise', () => {
    for (const style of BOT_STYLES) {
      expect(botAction(facingRaise(style, 'AsAd')).type).not.toBe('fold');
      expect(botAction(facingRaise(style, 'AhKh')).type).not.toBe('fold');
    }
  });

  it('junk is not folded just for the blinds (no raise): calling station completes', () => {
    const limp = ctx('callingStation', '7c2d', '', { pot: 3, toCall: 2, currentBet: 2, minRaise: 2 });
    expect(botAction(limp).type).toBe('call');
  });

  it('is deterministic: same spot, same decision', () => {
    for (const style of BOT_STYLES) {
      const a = botAction(facingRaise(style, 'Jd4c'));
      const b = botAction(facingRaise(style, 'Jd4c'));
      expect(a).toEqual(b);
    }
  });
});

describe('bot folds: bad or missed draws postflop', () => {
  // Pot-size river bet: pot 40 incl. the bet, 20 to call → 1/3 price.
  const riverBet = { pot: 40, toCall: 20, currentBet: 20, minRaise: 20 } as const;

  it.each(BOT_STYLES)('%s folds a missed flush draw to a river bet', (style) => {
    // 9h8h on Kh 4h 2c Jd 3s: four-flush and straight both missed, nine high.
    expect(botAction(ctx(style, '9h8h', 'Kh4h2cJd3s', riverBet)).type).toBe('fold');
  });

  it.each(BOT_STYLES)('%s folds air with no draw to a big flop bet', (style) => {
    // 6c2d on Ks Qh 9c: no pair, no draw, no overcards.
    const flopBet = { pot: 30, toCall: 15, currentBet: 15, minRaise: 15 } as const;
    expect(botAction(ctx(style, '6c2d', 'KsQh9c', flopBet)).type).toBe('fold');
  });

  it('calling station keeps a live flush draw on the flop', () => {
    const flopBet = { pot: 30, toCall: 10, currentBet: 10, minRaise: 10 } as const;
    expect(botAction(ctx('callingStation', '9h8h', 'Kh4h2c', flopBet)).type).not.toBe('fold');
  });

  it.each(BOT_STYLES)(
    '%s does not fold a strong made hand when the board draw missed for someone else',
    (style) => {
      // Set of sevens on Ks 7h 2h 9c 3d — the heart draw bricked, the set did not.
      expect(botAction(ctx(style, '7c7d', 'Ks7h2h9c3d', riverBet)).type).not.toBe('fold');
      // Top two pair on the same board.
      expect(botAction(ctx(style, 'Kd9d', 'Ks7h2h9c3d', riverBet)).type).not.toBe('fold');
    },
  );

  it('calling station still calls a river bet with a pair of its own', () => {
    expect(botAction(ctx('callingStation', 'Qc7c', 'Ks7h2h9c3d', riverBet)).type).toBe('call');
  });

  it('a paired board alone is not a made hand: missed draw folds on 8-8 boards', () => {
    expect(botAction(ctx('callingStation', '6h5h', 'Ah8h8cKd2s', riverBet)).type).toBe('fold');
  });
});
