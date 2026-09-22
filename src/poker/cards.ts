import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rankLabel(rank: Rank): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  if (rank === 10) return 'T';
  return String(rank);
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 's': return '♠';
    case 'h': return '♥';
    case 'd': return '♦';
    case 'c': return '♣';
  }
}

export function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'h' || suit === 'd' ? 'red' : 'black';
}

export function cardKey(c: Card): string {
  return `${rankLabel(c.rank)}${c.suit}`;
}

export function parseCard(s: string): Card {
  const rankChar = s[0]!.toUpperCase();
  const suitChar = s[1]!.toLowerCase() as Suit;
  let rank: Rank;
  if (rankChar === 'A') rank = 14;
  else if (rankChar === 'K') rank = 13;
  else if (rankChar === 'Q') rank = 12;
  else if (rankChar === 'J') rank = 11;
  else if (rankChar === 'T') rank = 10;
  else rank = Number(rankChar) as Rank;
  return { rank, suit: suitChar };
}

export function parseCards(s: string): Card[] {
  // "AsKh" or "As Kh"
  const cleaned = s.replace(/\s+/g, '');
  const cards: Card[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    cards.push(parseCard(cleaned.slice(i, i + 2)));
  }
  return cards;
}
