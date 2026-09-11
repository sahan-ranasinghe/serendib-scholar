"use client";

/**
 * Zara (සාරා) — face A, ported from Zara.dc.html. Flat fills with one warm
 * shade and three highlights, lit from the upper left; 3–4.5-unit strokes
 * on brows, lashes and mouth only (viewBox 240×320). Kandyan osariya:
 * saffron jacket, purple drape with a gold border, waist frill, bun, gold
 * studs and chain, no pottu. Layered parts carry the ids from zara.svg
 * (bun, body, saree-skirt, saree-frill, arm-left, arm-right, head, face,
 * face-shade, hair, brows, eyes, mouth) so the Rive rig can replace it.
 *
 * States — every one set by the screen, never by a timer in here:
 *   idle (three motion variants: breath, glance at the board, weight
 *   shift — CSS, rotated), talking (mouths 1–3 from amplitude),
 *   listening, thinking, encourage, celebrate, pointing (left/right from
 *   `side`), wave. The portrait crops to the face (viewBox 46 34 148 148),
 *   round, on saffron-soft paper; talking puts a saffron ring on it.
 */

export type ZaraState = "idle" | "talking" | "listening" | "thinking" | "encourage" | "celebrate" | "pointing" | "wave";

export interface ZaraCharacterProps {
  state: ZaraState;
  /** RMS of the audio currently audible, 0..~1 (see PcmPlayer.getAmplitude). */
  amplitude: number;
  /** Which side of the board the pointer is on — the pointing arm mirrors it. */
  side?: "left" | "right" | null;
  /** The head only, cropped for a small round portrait. */
  portrait?: boolean;
  /** Width in px (a portrait is square; a full figure is 4:3 tall). */
  size?: number;
  /** Which idle variant to play (the screen rotates them). */
  idleVariant?: 1 | 2 | 3;
}

/** amplitude → one of three mouth shapes; the mouth moves whenever she is audible. */
export function mouthShapeFor(state: ZaraState, amplitude: number): "closed" | "mid" | "open" {
  if (state === "listening" || state === "thinking") return "closed";
  if (amplitude > 0.12) return "open";
  if (amplitude > 0.035) return "mid";
  return "closed";
}

const FACE = {
  faceD: "M120 50c-32 0-48 26-48 60 0 34 20 56 48 56s48-22 48-56c0-34-16-60-48-60z",
  shadeD: "M152 90c12 26 6 56-14 74 26-12 36-50 14-74z",
  hairD: "M72 110c-4-44 18-64 48-64s52 20 48 64c-8-28-24-44-48-44s-40 16-48 44z",
  partD: "M120 50v12",
  eyeL: "M86 106q15-18 30 0q-15 9-30 0z",
  eyeR: "M124 106q15-18 30 0q-15 9-30 0z",
  irisR: 7,
  pupR: 3.4,
  lashL: "M86 106q15-18 30 0",
  lashR: "M124 106q15-18 30 0",
  browL: "M88 90q13-11 27-5",
  browR: "M125 85q14-6 27 5",
  smile: "M104 130q16 4 32 0q-16 14-32 0z",
  smileEye: "M90 114q11 4 22 0M128 114q11 4 22 0",
};

const MOUTH: Record<string, string> = {
  soft: "M106 130q14 8 28 0q-14 6-28 0z",
  half: "M104 131q16 8 32-5q-16 12-32 5z",
  purse: "M111 132q9 4 18 0q-9 5-18 0z",
  talk1: "M111 128q9-6 18 0q-9 11-18 0z",
  talk2: "M106 126q14-6 28 0q-2 15-14 15t-14-15z",
  talk3: "M104 128q16-8 32 0q-4 9-16 9t-16-9z",
  big: "M102 126q18 4 36 0q-4 19-18 19t-18-19z",
};

const ARM: Record<string, [string, number, number]> = {
  downL: ["M46 230c-10 30-12 56-10 84", 34, 318],
  downR: ["M194 230c10 30 12 56 10 84", 206, 318],
  pointL: ["M46 228C34 210 22 196 6 180", 4, 176],
  pointR: ["M194 228C206 210 218 196 234 180", 236, 176],
  upL: ["M46 228C36 200 30 160 34 124", 34, 118],
  upR: ["M194 228C204 200 210 160 206 124", 206, 118],
  chinR: ["M194 230c10 30-2 52-26 44C148 262 136 210 134 160", 132, 152],
  waveR: ["M194 228C210 208 218 176 212 140", 212, 132],
};

interface Pose {
  mouth: string;
  headT?: string;
  bodyT?: string;
  brow?: number;
  browL?: number;
  browR?: number;
  iris?: [number, number];
  armL?: string;
  armR?: string;
}

const POSES: Record<string, Pose> = {
  idle: { mouth: "smile" },
  talking: { mouth: "talk2", brow: -1 },
  listening: { mouth: "soft", headT: "rotate(-7 120 150) translate(0 6)", bodyT: "translate(0 4)", brow: -4 },
  thinking: { mouth: "purse", headT: "rotate(5 120 150)", iris: [3, -3], browL: -5, browR: 2, armR: "chinR" },
  encourage: { mouth: "half", headT: "translate(0 5) rotate(3 120 150)", brow: -2 },
  celebrate: { mouth: "big", bodyT: "translate(0 -8)", brow: -6, armL: "upL", armR: "upR" },
  "pointing-left": { mouth: "smile", headT: "rotate(-4 120 150)", iris: [-3, 0], armL: "pointL" },
  "pointing-right": { mouth: "smile", headT: "rotate(4 120 150)", iris: [3, 0], armR: "pointR" },
  wave: { mouth: "big", brow: -4, armR: "waveR" },
};

const TRANSITION = "transform var(--dur-ui) var(--ease-settle)";

export default function ZaraCharacter({ state, amplitude, side = null, portrait = false, size, idleVariant = 1 }: ZaraCharacterProps) {
  const poseKey = state === "pointing" ? (side === "left" ? "pointing-left" : "pointing-right") : state;
  const pose = POSES[poseKey] ?? POSES.idle!;
  const shape = mouthShapeFor(state, amplitude);
  let mouthKey = pose.mouth;
  if (mouthKey === "talk2") mouthKey = shape === "open" ? "talk3" : shape === "mid" ? "talk2" : "talk1";
  const smiling = mouthKey === "smile";
  const mouthD = smiling ? FACE.smile : MOUTH[mouthKey]!;
  const dark = /talk|big/u.test(mouthKey);
  const armL = ARM[pose.armL ?? "downL"]!;
  const armR = ARM[pose.armR ?? "downR"]!;
  const [ix, iy] = pose.iris ?? [0, 0];
  const bL = pose.browL ?? pose.brow ?? 0;
  const bR = pose.browR ?? pose.brow ?? 0;
  const irisY = 102 + iy;
  const px = size ?? (portrait ? 64 : 240);
  const w = px;
  const h = portrait ? px : Math.round((px * 320) / 240);
  const talking = state === "talking";
  return (
    <div
      className={`zara-root zara-${state} zara-idle-${idleVariant}`}
      data-state={state}
      data-side={side ?? undefined}
      style={{
        width: w,
        height: h,
        borderRadius: portrait ? "50%" : 0,
        overflow: portrait ? "hidden" : "visible",
        background: portrait ? "var(--color-saffron-soft)" : "transparent",
        position: "relative",
        flex: "none",

        boxShadow: portrait
          ? talking
            ? "0 0 0 4px var(--color-saffron), 0 0 0 10px rgba(233,180,76,.35), 0 6px 14px rgba(27,27,27,.12)"
            : "0 2px 0 #D8D1C2, 0 6px 14px rgba(27,27,27,.12)"
          : "none",
        border: portrait ? "3px solid var(--color-paper)" : "none",
        transition: "box-shadow var(--dur-ui) var(--ease-settle)",
      }}
    >
      <svg viewBox={portrait ? "46 34 148 148" : "0 0 240 320"} width="100%" height="100%" style={{ display: "block", position: "relative", overflow: "visible" }} data-part="zara" role="img" aria-label="Zara, your tutor">
        <g id="zara" className="zara-body" transform={pose.bodyT ?? "translate(0 0)"} style={{ transition: TRANSITION }}>
          <g id="bun" data-part="bun">
            <circle cx="160" cy="60" r="22" fill="var(--zara-hair)" />
            <path d="M146 50q14-8 28 4" fill="none" stroke="#4A3026" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g id="body" data-part="body">
            <path id="neck" d="M106 140h28v50h-28z" fill="var(--skin-shade)" />
            <path id="saree-skirt" data-part="saree-skirt" d="M36 250h168l10 70H26z" fill="var(--zara-saree)" />
            <path d="M60 256q12 8 24 0t24 0t24 0t24 0t24 0" fill="none" stroke="var(--zara-gold)" strokeWidth="2.5" />
            <path id="jacket" d="M44 222C44 194 84 178 120 178s76 16 76 44l4 30H40z" fill="var(--zara-jacket)" />
            <ellipse cx="48" cy="226" rx="20" ry="26" fill="var(--zara-jacket)" />
            <ellipse cx="192" cy="226" rx="20" ry="26" fill="#D9A23B" />
            <path id="saree-drape" d="M158 180c36 30-6 74-80 140h62c58-62 86-98 70-140z" fill="var(--zara-saree)" />
            <path d="M158 180c36 30-6 74-80 140" fill="none" stroke="var(--zara-gold)" strokeWidth="3" />
            <path d="M200 196c-6 40 6 74 4 124" fill="none" stroke="var(--zara-gold)" strokeWidth="2" />
            <g id="saree-frill" data-part="saree-frill">
              <path d="M30 262q10-16 20 0t20 0t20 0t20 0l4 58H26z" fill="var(--zara-saree)" />
              <path d="M30 262q10-16 20 0t20 0t20 0t20 0" fill="none" stroke="var(--zara-gold)" strokeWidth="3" />
              <path d="M50 266v52M70 266v52M90 266v52" stroke="#4A3175" strokeWidth="2" />
              <path d="M40 270v46M60 270v46M80 270v46M100 270v46" stroke="#7A5FB0" strokeWidth="1.5" />
            </g>
            <path id="chain" d="M104 186q16 24 32 0" fill="none" stroke="var(--zara-gold)" strokeWidth="2" />
          </g>
          <g id="arm-left" data-part="arm-left">
            <path d={armL[0]} fill="none" stroke="var(--skin-base)" strokeWidth="18" strokeLinecap="round" />
            <circle cx={armL[1]} cy={armL[2]} r="11" fill="var(--skin-base)" />
          </g>
          <g id="arm-right" data-part="arm-right">
            <path d={armR[0]} fill="none" stroke="var(--skin-base)" strokeWidth="18" strokeLinecap="round" />
            <circle cx={armR[1]} cy={armR[2]} r="11" fill="var(--skin-base)" />
          </g>
          <g id="head" data-part="head" className="zara-head" transform={pose.headT ?? "translate(0 0)"} style={{ transition: TRANSITION }}>
            <ellipse cx="74" cy="112" rx="7" ry="10" fill="var(--skin-base)" />
            <ellipse cx="166" cy="112" rx="7" ry="10" fill="#C0875A" />
            <circle cx="74" cy="124" r="4" fill="var(--zara-gold)" />
            <circle cx="166" cy="124" r="4" fill="var(--zara-gold)" />
            <path id="face" data-part="face" d={FACE.faceD} fill="var(--skin-base)" />
            <path id="face-shade" data-part="face-shade" d={FACE.shadeD} fill="var(--skin-shade)" opacity=".22" />
            <ellipse cx="108" cy="82" rx="12" ry="5" fill="var(--skin-highlight)" opacity=".45" />
            <ellipse cx="90" cy="122" rx="8" ry="4" fill="var(--skin-highlight)" opacity=".5" transform="rotate(-18 90 122)" />
            <ellipse cx="150" cy="122" rx="6" ry="3.5" fill="var(--skin-highlight)" opacity=".35" transform="rotate(18 150 122)" />
            <path id="nose" d="M119 94v16" fill="none" stroke="var(--skin-highlight)" strokeWidth="3" strokeLinecap="round" opacity=".55" />
            <path id="hair" data-part="hair" d={FACE.hairD} fill="var(--zara-hair)" />
            <path d={FACE.partD} fill="none" stroke="#4A3026" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx="97" cy="126" rx="9" ry="5" fill="var(--skin-blush)" opacity=".32" />
            <ellipse cx="143" cy="126" rx="9" ry="5" fill="var(--skin-blush)" opacity=".32" />
            <g id="brows" data-part="brows" style={{ transition: TRANSITION }}>
              <path d={FACE.browL} transform={`translate(0 ${bL})`} fill="none" stroke="var(--zara-hair)" strokeWidth="4.5" strokeLinecap="round" />
              <path d={FACE.browR} transform={`translate(0 ${bR})`} fill="none" stroke="var(--zara-hair)" strokeWidth="4.5" strokeLinecap="round" />
            </g>
            <g id="eyes" data-part="eyes" className="zara-eyes">
              <path d={FACE.eyeL} fill="#FFFAF3" />
              <path d={FACE.eyeR} fill="#FFFAF3" />
              <circle cx={101 + ix} cy={irisY} r={FACE.irisR} fill="#4A2A18" />
              <circle cx={139 + ix} cy={irisY} r={FACE.irisR} fill="#4A2A18" />
              <circle cx={101 + ix} cy={irisY} r={FACE.pupR} fill="var(--color-ink)" />
              <circle cx={139 + ix} cy={irisY} r={FACE.pupR} fill="var(--color-ink)" />
              <circle cx={104 + ix} cy={irisY - 3} r="2.6" fill="#fff" />
              <circle cx={142 + ix} cy={irisY - 3} r="2.6" fill="#fff" />
              <circle cx={98 + ix} cy={irisY + 3} r="1.2" fill="#fff" />
              <circle cx={136 + ix} cy={irisY + 3} r="1.2" fill="#fff" />
              <path d={FACE.lashL} fill="none" stroke="var(--zara-hair)" strokeWidth="3" strokeLinecap="round" />
              <path d={FACE.lashR} fill="none" stroke="var(--zara-hair)" strokeWidth="3" strokeLinecap="round" />
              <path d={smiling || mouthKey === "big" || mouthKey === "half" ? FACE.smileEye : "M0 0"} fill="none" stroke="var(--skin-shade)" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
            </g>
            <path d="M124 110q3 7-4 9" fill="none" stroke="var(--skin-shade)" strokeWidth="2.5" strokeLinecap="round" />
            <g id="mouth" data-part="mouth">
              <path d={mouthD} fill={dark ? "#5B2A22" : "var(--zara-lip)"} stroke="var(--zara-lip)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d={mouthKey === "big" ? "M106 128q14 3 28 0v5h-28z" : "M0 0"} fill="#fff" />
            </g>
          </g>
        </g>
      </svg>
      <style>{`
        /* idle: breath · glance at the board · weight shift — motion, not pose */
        .zara-idle .zara-body { animation: zara-breath 3.6s ease-in-out infinite; transform-origin: 120px 200px; }
        .zara-idle.zara-idle-2 .zara-eyes { animation: zara-glance 6s ease-in-out infinite; }
        .zara-idle.zara-idle-3 .zara-body { animation: zara-shift 5s ease-in-out infinite; }
        @keyframes zara-breath { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.012); } }
        @keyframes zara-glance { 0%, 70%, 100% { transform: translateX(0); } 80%, 90% { transform: translateX(3px); } }
        @keyframes zara-shift { 0%, 100% { transform: translateX(0) rotate(0); } 50% { transform: translateX(2px) rotate(0.6deg); } }
        .zara-eyes { animation: zara-blink 5.2s ease-in-out infinite; transform-origin: 120px 104px; }
        @keyframes zara-blink { 0%, 94%, 100% { transform: scaleY(1); } 96%, 98% { transform: scaleY(0.12); } }
        .zara-celebrate .zara-eyes, .zara-thinking .zara-eyes { animation: none; }
        @media (prefers-reduced-motion: reduce) { .zara-body, .zara-eyes { animation: none !important; } }
      `}</style>
    </div>
  );
}
