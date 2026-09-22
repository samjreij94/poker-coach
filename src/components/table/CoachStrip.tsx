import type { CoachAdvice, CoachGrade } from '../../poker/types';
import './CoachStrip.css';

interface CoachStripProps {
  /** Collapsed strip by default (C1); expand in C2 when advice present */
  advice?: CoachAdvice | null;
  grade?: CoachGrade | null;
  collapsed?: boolean;
}

export function CoachStrip({ advice = null, grade = null, collapsed = true }: CoachStripProps) {
  const open = !collapsed && Boolean(advice || grade);

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
          <span className="pc-coach__hint">{advice ? 'Live' : 'Ready'}</span>
        )}
      </div>
      {open && advice ? (
        <div className="pc-coach__body">
          <p className="pc-coach__rec">
            <strong>{advice.recommended.toUpperCase()}</strong>
            {advice.sizeRange ? ` · ${advice.sizeRange.label}` : ''}
          </p>
          <p className="pc-coach__reason">{grade?.why ?? advice.reason}</p>
          {advice.concepts.length > 0 ? (
            <ul className="pc-coach__concepts">
              {advice.concepts.slice(0, 3).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
