import { useEffect, useMemo, useState } from 'react';
import type { CoachAdvice, CoachGrade, HandClass, Position } from '../../poker/types';
import './CoachStrip.css';

interface CoachStripProps {
  /** Collapsed strip by default (C1); expand in C2 when advice present */
  advice?: CoachAdvice | null;
  grade?: CoachGrade | null;
  collapsed?: boolean;
}

/** Short plain seat labels for metric chips (never raw EP/CO/BTN). */
const POSITION_CHIP: Record<Position, string> = {
  EP: 'Early',
  MP: 'Middle',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};

/** Short plain hand-strength labels for metric chips (never raw air). */
const HAND_CLASS_CHIP: Record<HandClass, string> = {
  air: 'Weak hand',
  weakDraw: 'Weak draw',
  strongDraw: 'Strong draw',
  weakMade: 'Weak pair',
  strongMade: 'Strong hand',
  nuts: 'Nuts',
};

function potOddsChip(potOdds: number | undefined): string | null {
  if (potOdds === undefined || !(potOdds > 0)) return null;
  return `Pot odds ${Math.round(potOdds * 100)}%`;
}

function sprChip(spr: number | undefined): string | null {
  if (spr === undefined || !Number.isFinite(spr)) return null;
  const rounded = spr >= 10 ? Math.round(spr) : Math.round(spr * 10) / 10;
  return `SPR ${rounded}`;
}

export function CoachStrip({ advice = null, grade = null, collapsed = true }: CoachStripProps) {
  const teaching = advice ?? grade?.advice ?? null;
  const open = !collapsed && Boolean(teaching || grade);

  const [moreOpen, setMoreOpen] = useState(false);

  // Reset expand when the teaching snapshot changes (new decision / new grade)
  const teachingKey = teaching
    ? `${teaching.recommended}|${teaching.reason}|${grade?.grade ?? ''}|${(teaching.details ?? []).join('\0')}`
    : grade?.why ?? '';

  useEffect(() => {
    setMoreOpen(false);
  }, [teachingKey]);

  const details = teaching?.details ?? [];
  const hasMore = details.length > 2;
  const visibleDetails = moreOpen || !hasMore ? details : details.slice(0, 2);

  const chips = useMemo(() => {
    if (!teaching) return [] as string[];
    const out: string[] = [];
    out.push(POSITION_CHIP[teaching.position] ?? teaching.position);
    out.push(HAND_CLASS_CHIP[teaching.handClass] ?? teaching.handClass);
    const odds = potOddsChip(teaching.potOdds);
    if (odds) out.push(odds);
    const sprLabel = sprChip(teaching.spr);
    if (sprLabel) out.push(sprLabel);
    return out;
  }, [teaching]);

  const reason = grade?.why ?? teaching?.reason ?? '';
  const headline = teaching
    ? `${teaching.recommended.toUpperCase()}${teaching.sizeRange ? ` · ${teaching.sizeRange.label}` : ''}`
    : null;

  return (
    <aside
      className={`pc-coach ${open ? 'pc-coach--open' : 'pc-coach--collapsed'}`}
      aria-label="Live Coach"
    >
      <div className="pc-coach__handle">
        <span className="pc-coach__badge">Coach</span>
        {grade ? (
          <span className={`pc-coach__grade pc-coach__grade--${grade.grade.toLowerCase()}`}>
            {grade.grade}
          </span>
        ) : (
          <span className="pc-coach__hint">{teaching ? 'Live' : 'Ready'}</span>
        )}
      </div>
      {open && teaching ? (
        <div className="pc-coach__body">
          {headline ? (
            <p className="pc-coach__rec">
              <strong>{teaching.recommended.toUpperCase()}</strong>
              {teaching.sizeRange ? ` · ${teaching.sizeRange.label}` : ''}
            </p>
          ) : null}
          {reason ? <p className="pc-coach__reason">{reason}</p> : null}

          {/* Teaching first: 2 details + More above the fold; chips after */}
          {visibleDetails.length > 0 ? (
            <ul className="pc-coach__details">
              {visibleDetails.map((d, i) => (
                <li key={`${i}-${d.slice(0, 24)}`}>{d}</li>
              ))}
            </ul>
          ) : null}

          {hasMore ? (
            <button
              type="button"
              className="pc-coach__more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? 'Less' : 'More'}
            </button>
          ) : null}

          {chips.length > 0 ? (
            <ul className="pc-coach__chips" aria-label="Coach metrics">
              {chips.map((c) => (
                <li key={c} className="pc-coach__chip pc-coach__chip--metric">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
