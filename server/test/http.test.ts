import { describe, expect, it } from 'vitest';
import { corsHeaders, originAllowed, RATE_LIMITS, rateLimit } from '../src/http';

const env = { ALLOWED_ORIGINS: 'https://samjreij94.github.io,http://localhost:5173' };
const req = (origin?: string) =>
  new Request('https://x/api/rooms', { headers: origin ? { Origin: origin } : {} });

describe('origin allow-list + CORS', () => {
  it('allows listed origins and no-Origin tools, blocks others', () => {
    expect(originAllowed(req('https://samjreij94.github.io'), env)).toBe(true);
    expect(originAllowed(req('http://localhost:5173'), env)).toBe(true);
    expect(originAllowed(req(), env)).toBe(true);
    expect(originAllowed(req('https://evil.example'), env)).toBe(false);
    expect(originAllowed(req('https://evil.example'), { ALLOWED_ORIGINS: '*' })).toBe(true);
  });
  it('echoes only allowed origins in ACAO', () => {
    expect(corsHeaders(req('http://localhost:5173'), env)['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(corsHeaders(req('https://evil.example'), env)['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('rate limit (fixed window per IP)', () => {
  it('429s after the per-minute limit and resets next window', () => {
    const t = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.create; i++) expect(rateLimit('create', '1.2.3.4', t + i)).toBe(true);
    expect(rateLimit('create', '1.2.3.4', t + 100)).toBe(false);
    expect(rateLimit('create', '5.6.7.8', t + 100)).toBe(true);
    expect(rateLimit('join', '1.2.3.4', t + 100)).toBe(true);
    expect(rateLimit('create', '1.2.3.4', t + 60_000)).toBe(true);
  });
});
