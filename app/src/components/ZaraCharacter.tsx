"use client";

/**
 * Zara — illustrated SVG placeholder for the commissioned Rive character.
 * A warm 2D figure (head, shoulders, face), NOT an icon in a circle.
 *
 * Interface is deliberately just { state, amplitude } so the Rive file can
 * drop in later without touching any caller:
 *   idle        slow blink every 4-6s, gentle breathing
 *   listening   slight head tilt, eyes toward the child
 *   talking     mouth cycles between 3 shapes driven by output amplitude
 *   celebrating brief bounce (caller holds the state for ~1.2s)
 */
import { useEffect, useState } from "react";

export type ZaraState = "idle" | "listening" | "talking" | "celebrating";

export interface ZaraCharacterProps {
  state: ZaraState;
  /** RMS of the audio currently audible, 0..~1 (see PcmPlayer.getAmplitude). */
  amplitude: number;
}

/** amplitude → one of three mouth shapes. Exported so the mapping is testable. */
export function mouthShapeFor(state: ZaraState, amplitude: number): "closed" | "mid" | "open" {
  if (state !== "talking") return "closed";
  if (amplitude > 0.12) return "open";
  if (amplitude > 0.035) return "mid";
  return "closed";
}

const MOUTH_PATHS: Record<"closed" | "mid" | "open", string> = {
  closed: "M 82 118 Q 100 126 118 118", // gentle smile
  mid: "M 84 116 Q 100 130 116 116 Q 100 124 84 116 Z", // parted
  open: "M 84 112 Q 100 138 116 112 Q 100 122 84 112 Z", // open oval
};

export default function ZaraCharacter({ state, amplitude }: ZaraCharacterProps) {
  // Slow blink every 4-6s while idle/listening (talking blinks too — real
  // faces do — but never mid-celebration).
  const [blinking, setBlinking] = useState(false);
  useEffect(() => {
    if (state === "celebrating") return;
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const scheduleBlink = () => {
      closeTimer = setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        openTimer = setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          scheduleBlink();
        }, 140);
      }, 4000 + Math.random() * 2000);
    };
    scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
    };
  }, [state]);

  const mouth = mouthShapeFor(state, amplitude);
  const tilt = state === "listening" ? -6 : 0;

  return (
    <div
      className={`zara-root ${state === "celebrating" ? "zara-celebrate" : ""}`}
      style={{ width: "100%", height: "100%" }}
      data-state={state}
    >
      <svg viewBox="0 0 200 210" className="zara-svg" role="img" aria-label="Zara, your tutor">
        {/* shoulders + body */}
        <path d="M 40 210 Q 42 158 100 154 Q 158 158 160 210 Z" fill="#7C5CBF" />
        <path d="M 78 168 Q 100 160 122 168 L 118 210 L 82 210 Z" fill="#F5EFE0" />
        {/* breathing group: whole upper body rises gently */}
        <g className="zara-breathe">
          {/* head group: tilts while listening */}
          <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: "100px 140px", transition: "transform 400ms ease" }}>
            {/* hair back */}
            <path d="M 52 96 Q 46 30 100 26 Q 154 30 148 96 Q 152 128 138 142 L 62 142 Q 48 128 52 96 Z" fill="#3B2B20" />
            {/* face */}
            <ellipse cx="100" cy="94" rx="42" ry="46" fill="#C68B59" />
            {/* hair front */}
            <path d="M 58 84 Q 60 42 100 38 Q 140 42 142 84 Q 128 62 100 60 Q 72 62 58 84 Z" fill="#4A3728" />
            {/* ears + earrings */}
            <circle cx="57" cy="96" r="7" fill="#C68B59" />
            <circle cx="143" cy="96" r="7" fill="#C68B59" />
            <circle cx="57" cy="104" r="2.5" fill="#E8B04B" />
            <circle cx="143" cy="104" r="2.5" fill="#E8B04B" />
            {/* eyes: open ellipses that squash to lines when blinking */}
            <g fill="#2B1D12">
              <ellipse cx="84" cy="90" rx="5" ry={blinking ? 0.8 : 6} />
              <ellipse cx="116" cy="90" rx="5" ry={blinking ? 0.8 : 6} />
            </g>
            {/* pupils shift toward the child (viewer's left) while listening */}
            {!blinking && (
              <g fill="#fff">
                <circle cx={state === "listening" ? 82 : 85.5} cy="88" r="1.6" />
                <circle cx={state === "listening" ? 114 : 117.5} cy="88" r="1.6" />
              </g>
            )}
            {/* brows */}
            <path d="M 76 78 Q 84 74 92 78" stroke="#2B1D12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 108 78 Q 116 74 124 78" stroke="#2B1D12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            {/* nose */}
            <path d="M 100 96 Q 97 104 101 106" stroke="#A97142" strokeWidth="2" fill="none" strokeLinecap="round" />
            {/* cheeks */}
            <circle cx="74" cy="106" r="6" fill="#D89B6A" opacity="0.6" />
            <circle cx="126" cy="106" r="6" fill="#D89B6A" opacity="0.6" />
            {/* mouth: 3 shapes driven by amplitude */}
            <path
              d={MOUTH_PATHS[mouth]}
              fill={mouth === "closed" ? "none" : "#7A3B2E"}
              stroke="#7A3B2E"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
      <style>{`
        .zara-root {
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .zara-svg {
          width: 100%;
          height: 100%;
        }
        .zara-breathe {
          animation: zara-breathe 3.6s ease-in-out infinite;
          transform-origin: 100px 150px;
        }
        @keyframes zara-breathe {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-2px) scale(1.012);
          }
        }
        .zara-celebrate {
          animation: zara-bounce 0.6s cubic-bezier(0.28, 1.6, 0.5, 1) 2;
        }
        @keyframes zara-bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-14px);
          }
        }
      `}</style>
    </div>
  );
}
