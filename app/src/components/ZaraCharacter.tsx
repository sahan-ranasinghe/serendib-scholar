"use client";

/**
 * Zara — face A, ported byte-for-byte from the design export's Zara.dc.html
 * (docs/design/export/handoff/…): the SVG template, the FACES / MOUTH / ARM
 * tables and the STATES table are the export's, verbatim. Skin base
 * #D29A6A, shade #B27A4E, highlight #EDC094, blush #E0805A, lip #A64F3C;
 * layered parts carry the rig ids as data-part (bun, body, saree-skirt,
 * saree-frill, arm-left, arm-right, head, face, face-shade, hair, brows,
 * eyes, mouth). Talking = the saffron ring on the portrait.
 *
 * The runtime speaks in "pointing" + a side; the export's states are
 * pointing-left / pointing-right. The three talking mouths follow the
 * output amplitude.
 */
import type { CSSProperties } from "react";

export type ZaraState = "idle" | "talking" | "listening" | "thinking" | "encourage" | "celebrate" | "pointing" | "pointing-left" | "pointing-right" | "wave";

export interface ZaraCharacterProps {
  state: ZaraState;
  /** RMS of the audio currently audible, 0..~1 (see audio.getAmplitude, src/lib/audioManager.ts). */
  amplitude: number;
  /** Which side of the board the pointer is on — the pointing arm mirrors it. */
  side?: "left" | "right" | null;
  /** The head only, cropped for a small round portrait. */
  portrait?: boolean;
  /** Width in px (a portrait is square; a full figure is 4:3 tall). */
  size?: number;
  /** Kept for callers; the export's Zara has no idle variants (motion is the animator's). */
  idleVariant?: 1 | 2 | 3;
  /** A talking mouth to force (0 closed · 1 · 2 · 3); otherwise from the amplitude. */
  mouth?: MouthShape;
}

// --- the export's tables, verbatim --------------------------------------------

const FACE_A = {
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
  dimple: "M0 0",
  teeth: undefined as string | undefined,
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

interface StateSpec {
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

export const ZARA_STATES: Record<string, StateSpec> = {
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

/**
 * The mouth for an output amplitude, per frame: closed on silence, then
 * three open shapes by band — 1 small o · 2 open · 3 wide ah. The bands are
 * RMS of the clip's own output (an AnalyserNode on the player), so the
 * mouth follows the voice rather than a "talking" flag.
 */
export type MouthShape = 0 | 1 | 2 | 3;
export const MOUTH_SILENCE = 0.012;
export function mouthShapeFor(amplitude: number): MouthShape {
  if (amplitude < MOUTH_SILENCE) return 0;
  if (amplitude < 0.05) return 1;
  if (amplitude < 0.14) return 2;
  return 3;
}

export default function ZaraCharacter({ state, amplitude, side = null, portrait = false, size, mouth }: ZaraCharacterProps) {
  const stateKey = state === "pointing" ? (side === "left" ? "pointing-left" : "pointing-right") : state;
  const F = FACE_A;
  const st = ZARA_STATES[stateKey] ?? ZARA_STATES.idle!;
  const px = size ?? 240;
  let mk = st.mouth;
  const shape: MouthShape = mouth ?? mouthShapeFor(amplitude);
  // Talking with the sound at silence (between words, the clip's tail): the mouth closes to her smile.
  // Her mouth follows what is audible: the talking state's shapes, and any audio through her player (a chat reply, a test clip) even in another state.
  if (mk === "talk2" || shape > 0) mk = shape === 0 ? "smile" : `talk${shape}`;
  const smiling = mk === "smile";
  const mouthD = smiling ? F.smile : MOUTH[mk]!;
  const dark = /talk|big/.test(mk);
  const al = ARM[st.armL ?? "downL"]!;
  const ar = ARM[st.armR ?? "downR"]!;
  const [ix, iy] = st.iris ?? [0, 0];
  const bL = st.browL ?? st.brow ?? 0;
  const bR = st.browR ?? st.brow ?? 0;
  const iy0 = 102 + iy;
  const talking = stateKey === "talking";
  const w = px;
  const h = portrait ? px : Math.round((px * 320) / 240);
  const vb = portrait ? "46 34 148 148" : "0 0 240 320";
  const box: CSSProperties = {
    width: w,
    height: h,
    borderRadius: portrait ? "50%" : 0,
    overflow: portrait ? "hidden" : "visible",
    background: portrait ? "#FBEFD3" : "transparent",
    position: "relative",
    flex: "none",
    boxShadow: portrait ? (talking ? "0 0 0 4px #E9B44C, 0 0 0 10px rgba(233,180,76,.35), 0 6px 14px rgba(27,27,27,.12)" : "0 2px 0 #D8D1C2, 0 6px 14px rgba(27,27,27,.12)") : "none",
    border: portrait ? "3px solid #FFFDF8" : "none",
  };
  const smileEyeD = smiling || mk === "big" || mk === "half" ? F.smileEye : "M0 0";
  const teethD = mk === "big" ? "M106 128q14 3 28 0v5h-28z" : smiling && F.teeth ? F.teeth : "M0 0";
  return (
    <div className="zara-root" data-zara-state={stateKey} data-talking={talking || undefined} data-mouth={shape > 0 ? String(shape) : talking ? "0" : "closed"} style={box}>
      <svg viewBox={vb} width={w} height={h} style={{ display: "block", position: "relative", overflow: "visible" }} data-part="zara">
        <g transform={st.bodyT ?? "translate(0 0)"}>
          <g data-part="bun">
            <circle cx="160" cy="60" r="22" fill="#2E1B14" />
            <path d="M146 50q14-8 28 4" fill="none" stroke="#4A3026" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g data-part="body">
            <path d="M106 140h28v50h-28z" fill="#B27A4E" />
            <path data-part="saree-skirt" d="M36 250h168l10 70H26z" fill="#5A3E8C" />
            <path d="M60 256q12 8 24 0t24 0t24 0t24 0t24 0" fill="none" stroke="#D4A64A" strokeWidth="2.5" />
            <path d="M44 222C44 194 84 178 120 178s76 16 76 44l4 30H40z" fill="#E9B44C" />
            <ellipse cx="48" cy="226" rx="20" ry="26" fill="#E9B44C" />
            <ellipse cx="192" cy="226" rx="20" ry="26" fill="#D9A23B" />
            <path d="M158 180c36 30-6 74-80 140h62c58-62 86-98 70-140z" fill="#5A3E8C" />
            <path d="M158 180c36 30-6 74-80 140" fill="none" stroke="#D4A64A" strokeWidth="3" />
            <path d="M200 196c-6 40 6 74 4 124" fill="none" stroke="#D4A64A" strokeWidth="2" />
            <g data-part="saree-frill">
              <path d="M30 262q10-16 20 0t20 0t20 0t20 0l4 58H26z" fill="#5A3E8C" />
              <path d="M30 262q10-16 20 0t20 0t20 0t20 0" fill="none" stroke="#D4A64A" strokeWidth="3" />
              <path d="M50 266v52M70 266v52M90 266v52" stroke="#4A3175" strokeWidth="2" />
              <path d="M40 270v46M60 270v46M80 270v46M100 270v46" stroke="#7A5FB0" strokeWidth="1.5" />
            </g>
            <path d="M104 186q16 24 32 0" fill="none" stroke="#D4A64A" strokeWidth="2" />
          </g>
          <g data-part="arm-left">
            <path d={al[0]} fill="none" stroke="#D29A6A" strokeWidth="18" strokeLinecap="round" />
            <circle cx={al[1]} cy={al[2]} r="11" fill="#D29A6A" />
          </g>
          <g data-part="arm-right">
            <path d={ar[0]} fill="none" stroke="#D29A6A" strokeWidth="18" strokeLinecap="round" />
            <circle cx={ar[1]} cy={ar[2]} r="11" fill="#D29A6A" />
          </g>
          <g data-part="head" transform={st.headT ?? "translate(0 0)"}>
            <ellipse cx="74" cy="112" rx="7" ry="10" fill="#D29A6A" />
            <ellipse cx="166" cy="112" rx="7" ry="10" fill="#C0875A" />
            <circle cx="74" cy="124" r="4" fill="#D4A64A" />
            <circle cx="166" cy="124" r="4" fill="#D4A64A" />
            <path data-part="face" d={F.faceD} fill="#D29A6A" />
            <path data-part="face-shade" d={F.shadeD} fill="#B27A4E" opacity=".22" />
            <ellipse data-part="hl-forehead" cx="108" cy="82" rx="12" ry="5" fill="#EDC094" opacity=".45" />
            <ellipse data-part="hl-cheek-l" cx="90" cy="122" rx="8" ry="4" fill="#EDC094" opacity=".5" transform="rotate(-18 90 122)" />
            <ellipse data-part="hl-cheek-r" cx="150" cy="122" rx="6" ry="3.5" fill="#EDC094" opacity=".35" transform="rotate(18 150 122)" />
            <path d="M119 94v16" fill="none" stroke="#EDC094" strokeWidth="3" strokeLinecap="round" opacity=".55" />
            <path data-part="hair" d={F.hairD} fill="#2E1B14" />
            <path d={F.partD} fill="none" stroke="#4A3026" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx="97" cy="126" rx="9" ry="5" fill="#E0805A" opacity=".32" />
            <ellipse cx="143" cy="126" rx="9" ry="5" fill="#E0805A" opacity=".32" />
            <g data-part="brows">
              <path d={F.browL} transform={`translate(0 ${bL})`} fill="none" stroke="#2E1B14" strokeWidth="4.5" strokeLinecap="round" />
              <path d={F.browR} transform={`translate(0 ${bR})`} fill="none" stroke="#2E1B14" strokeWidth="4.5" strokeLinecap="round" />
            </g>
            <g data-part="eyes">
              <path d={F.eyeL} fill="#FFFAF3" />
              <path d={F.eyeR} fill="#FFFAF3" />
              <circle cx={101 + ix} cy={iy0} r={F.irisR} fill="#4A2A18" />
              <circle cx={139 + ix} cy={iy0} r={F.irisR} fill="#4A2A18" />
              <circle cx={101 + ix} cy={iy0} r={F.pupR} fill="#1B1B1B" />
              <circle cx={139 + ix} cy={iy0} r={F.pupR} fill="#1B1B1B" />
              <circle cx={104 + ix} cy={iy0 - 3} r="2.6" fill="#fff" />
              <circle cx={142 + ix} cy={iy0 - 3} r="2.6" fill="#fff" />
              <circle cx={98 + ix} cy={iy0 + 3} r="1.2" fill="#fff" />
              <circle cx={136 + ix} cy={iy0 + 3} r="1.2" fill="#fff" />
              <path d={F.lashL} fill="none" stroke="#2E1B14" strokeWidth="3" strokeLinecap="round" />
              <path d={F.lashR} fill="none" stroke="#2E1B14" strokeWidth="3" strokeLinecap="round" />
              <path d={smileEyeD} fill="none" stroke="#B27A4E" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
            </g>
            <path d="M124 110q3 7-4 9" fill="none" stroke="#B27A4E" strokeWidth="2.5" strokeLinecap="round" />
            <g data-part="mouth">
              <path d={mouthD} fill={dark ? "#5B2A22" : "#A64F3C"} stroke="#A64F3C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d={teethD} fill="#fff" />
              <path d={F.dimple} fill="none" stroke="#B27A4E" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
