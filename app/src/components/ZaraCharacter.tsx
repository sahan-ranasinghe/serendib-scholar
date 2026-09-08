"use client";

/**
 * Zara — a 2D figure in the classroom's style: a saree with a gold
 * border, a warm face, hair in a bun, a pottu. Drawn as SVG with NAMED
 * LAYERS (ids below) so the commissioned Rive file can replace it without
 * any caller changing: the interface stays { state, amplitude, side }.
 *
 * States — every one of them set by the orchestrator, never by a timer
 * inside this file (the only motion here that runs on its own is the idle
 * blink and breath, which are CSS):
 *   idle        blink, breathe
 *   talking     mouth from amplitude (3 shapes), a small head movement
 *   listening   leans in toward the board, eyes to the child
 *   thinking    a hand to the chin, eyes up (while an answer is judged)
 *   encourage   a soft nod (after a miss)
 *   celebrate   a brief bounce (after a correct answer)
 *   pointing    the arm out toward the board, mirroring the pointer's side
 * Transitions between states take ≤ 300 ms.
 *
 * Layers: #zara-body, #zara-saree, #zara-arm-left, #zara-arm-right,
 * #zara-head, #zara-hair, #zara-face, #zara-eyes, #zara-brows,
 * #zara-mouth, #zara-hand-chin.
 */

export type ZaraState = "idle" | "talking" | "listening" | "thinking" | "encourage" | "celebrate" | "pointing";

export interface ZaraCharacterProps {
  state: ZaraState;
  /** RMS of the audio currently audible, 0..~1 (see PcmPlayer.getAmplitude). */
  amplitude: number;
  /** Which side of the board the pointer is on — the pointing arm mirrors it. */
  side?: "left" | "right" | null;
}

/** amplitude → one of three mouth shapes; the mouth moves whenever she is audible. */
export function mouthShapeFor(state: ZaraState, amplitude: number): "closed" | "mid" | "open" {
  if (state === "listening" || state === "thinking") return "closed";
  if (amplitude > 0.12) return "open";
  if (amplitude > 0.035) return "mid";
  return "closed";
}

const MOUTH: Record<"closed" | "mid" | "open", string> = {
  closed: "M 84 121 Q 100 130 116 121",
  mid: "M 85 119 Q 100 133 115 119 Q 100 126 85 119 Z",
  open: "M 86 115 Q 100 141 114 115 Q 100 125 86 115 Z",
};

const TRANSITION = "transform 280ms cubic-bezier(0.3, 0.9, 0.3, 1.05)";

export default function ZaraCharacter({ state, amplitude, side = null }: ZaraCharacterProps) {
  const mouth = mouthShapeFor(state, amplitude);
  const pointing = state === "pointing";
  // The board is to her right (the viewer's right). Pointer on the board's
  // left half → the arm reaches less far; right half → further and higher.
  const armAngle = pointing ? (side === "right" ? -62 : -38) : state === "thinking" ? -95 : 8;
  const headTransform =
    state === "listening"
      ? "translate(6px, 2px) rotate(-7deg)"
      : state === "thinking"
        ? "rotate(5deg)"
        : state === "pointing"
          ? "rotate(-3deg)"
          : "none";
  const eyesTransform = state === "thinking" ? "translateY(-2.5px)" : state === "listening" ? "translateX(2px)" : "none";

  return (
    <div className={`zara-root zara-${state}`} style={{ width: "100%", height: "100%" }} data-state={state} data-side={side ?? undefined}>
      <svg viewBox="0 0 200 230" className="zara-svg" role="img" aria-label="Zara, your tutor">
        <g className="zara-bounce-layer">
          <g className="zara-breathe">
            {/* ---- body & saree --------------------------------------- */}
            <g id="zara-body">
              <path d="M 44 230 Q 44 172 100 166 Q 156 172 156 230 Z" fill="#8E3B5A" />
              <g id="zara-saree">
                {/* the pallu over the left shoulder, with the gold border */}
                <path d="M 78 176 Q 60 200 66 230 L 104 230 Q 96 200 106 172 Z" fill="#A94A6C" />
                <path d="M 80 178 Q 64 202 70 230" fill="none" stroke="#E2B84B" strokeWidth="3" />
                <path d="M 104 172 Q 94 200 102 230" fill="none" stroke="#E2B84B" strokeWidth="2" />
                {/* pleats */}
                <path d="M 118 190 L 116 230 M 128 192 L 128 230 M 138 196 L 140 230" stroke="#7A3050" strokeWidth="1.5" opacity="0.6" />
              </g>
              {/* blouse and neck */}
              <path d="M 82 172 Q 100 162 118 172 L 114 186 Q 100 180 86 186 Z" fill="#E2B84B" />
              <path d="M 90 150 L 110 150 L 110 172 Q 100 178 90 172 Z" fill="#B97A50" />
            </g>

            {/* ---- arms ----------------------------------------------- */}
            <g id="zara-arm-left">
              <path d="M 62 190 Q 44 210 46 230 L 60 230 Q 62 212 74 198 Z" fill="#B97A50" />
            </g>
            <g
              id="zara-arm-right"
              style={{ transform: `rotate(${armAngle}deg)`, transformOrigin: "138px 186px", transition: TRANSITION }}
            >
              {/* upper arm + hand, drawn hanging down; rotated up to point or to the chin */}
              <path d="M 132 184 Q 148 200 146 230 L 132 230 Q 130 206 124 194 Z" fill="#B97A50" />
              <circle cx="141" cy="228" r="7" fill="#C68B59" />
              {/* the pointing finger, only visible when the arm is up */}
              <path d="M 141 228 L 141 236" stroke="#C68B59" strokeWidth="4" strokeLinecap="round" opacity={pointing ? 1 : 0} />
            </g>
            <g id="zara-hand-chin" style={{ opacity: state === "thinking" ? 1 : 0, transition: "opacity 200ms" }}>
              <ellipse cx="120" cy="132" rx="9" ry="7" fill="#C68B59" />
            </g>

            {/* ---- head ----------------------------------------------- */}
            <g id="zara-head" style={{ transform: headTransform, transformOrigin: "100px 150px", transition: TRANSITION }}>
              <g className="zara-talk">
                <g id="zara-hair">
                  {/* bun */}
                  <circle cx="132" cy="62" r="16" fill="#2E2119" />
                  <path d="M 54 98 Q 48 34 100 30 Q 152 34 146 98 Q 150 128 138 142 L 62 142 Q 50 128 54 98 Z" fill="#3B2B20" />
                </g>
                <g id="zara-face">
                  <ellipse cx="100" cy="96" rx="42" ry="46" fill="#C68B59" />
                  {/* hair front, parted */}
                  <path d="M 58 86 Q 62 44 100 40 Q 138 44 142 86 Q 126 60 100 62 Q 76 64 58 86 Z" fill="#4A3728" />
                  <path d="M 100 40 Q 96 54 100 62" stroke="#2E2119" strokeWidth="1.2" fill="none" />
                  {/* ears, earrings */}
                  <circle cx="57" cy="98" r="7" fill="#C68B59" />
                  <circle cx="143" cy="98" r="7" fill="#C68B59" />
                  <path d="M 57 105 l 0 6" stroke="#E2B84B" strokeWidth="2" />
                  <path d="M 143 105 l 0 6" stroke="#E2B84B" strokeWidth="2" />
                  <circle cx="57" cy="113" r="3" fill="#E2B84B" />
                  <circle cx="143" cy="113" r="3" fill="#E2B84B" />
                  {/* pottu */}
                  <circle cx="100" cy="72" r="2.6" fill="#B5382F" />
                  {/* cheeks */}
                  <circle cx="74" cy="108" r="6" fill="#D89B6A" opacity="0.55" />
                  <circle cx="126" cy="108" r="6" fill="#D89B6A" opacity="0.55" />
                  {/* nose */}
                  <path d="M 100 98 Q 97 106 101 108" stroke="#A97142" strokeWidth="2" fill="none" strokeLinecap="round" />
                </g>
                <g id="zara-brows" stroke="#2B1D12" strokeWidth="2.5" fill="none" strokeLinecap="round" style={{ transform: state === "thinking" ? "translateY(-2px)" : "none", transition: TRANSITION }}>
                  <path d="M 76 80 Q 84 76 92 80" />
                  <path d="M 108 80 Q 116 76 124 80" />
                </g>
                <g id="zara-eyes" style={{ transform: eyesTransform, transition: TRANSITION }}>
                  <g className="zara-blink" fill="#2B1D12">
                    <ellipse cx="84" cy="92" rx="5" ry="6" />
                    <ellipse cx="116" cy="92" rx="5" ry="6" />
                  </g>
                  <g fill="#fff">
                    <circle cx={state === "listening" ? 82 : 85.5} cy="90" r="1.6" />
                    <circle cx={state === "listening" ? 114 : 117.5} cy="90" r="1.6" />
                  </g>
                </g>
                <path
                  id="zara-mouth"
                  d={MOUTH[mouth]}
                  fill={mouth === "closed" ? "none" : "#7A3B2E"}
                  stroke="#7A3B2E"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
      <style>{`
        .zara-root { display: flex; align-items: flex-end; justify-content: center; }
        .zara-svg { width: 100%; height: 100%; }
        .zara-breathe { animation: zara-breathe 3.6s ease-in-out infinite; transform-origin: 100px 160px; }
        @keyframes zara-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.012); } }
        /* the blink: a CSS clock, not a JS one */
        .zara-blink { animation: zara-blink 5.2s ease-in-out infinite; transform-origin: 100px 92px; }
        @keyframes zara-blink { 0%, 94%, 100% { transform: scaleY(1); } 96%, 98% { transform: scaleY(0.12); } }
        .zara-celebrate .zara-blink, .zara-thinking .zara-blink { animation: none; }
        /* talking: a small head movement in time with nothing in particular */
        .zara-talking .zara-talk, .zara-pointing .zara-talk { animation: zara-talk 1.1s ease-in-out infinite; transform-origin: 100px 130px; }
        @keyframes zara-talk { 0%, 100% { transform: rotate(0deg) translateY(0); } 30% { transform: rotate(1.2deg) translateY(-1px); } 70% { transform: rotate(-1deg) translateY(0.5px); } }
        /* encourage: one soft nod, while the state is held */
        .zara-encourage .zara-talk { animation: zara-nod 0.9s ease-in-out 1; transform-origin: 100px 130px; }
        @keyframes zara-nod { 0%, 100% { transform: rotate(0deg); } 35% { transform: translateY(4px) rotate(2deg); } 70% { transform: translateY(-1px) rotate(-1deg); } }
        /* celebrate: a brief bounce */
        .zara-celebrate .zara-bounce-layer { animation: zara-bounce 0.6s cubic-bezier(0.28, 1.6, 0.5, 1) 2; }
        @keyframes zara-bounce { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-14px); } }
        @media (prefers-reduced-motion: reduce) {
          .zara-breathe, .zara-talk, .zara-bounce-layer { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
