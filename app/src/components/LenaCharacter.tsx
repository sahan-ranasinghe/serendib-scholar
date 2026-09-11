"use client";

/**
 * Lena (ලේනා) — the three-striped palm squirrel, ported byte-for-byte from
 * the design export's Lena.dc.html: the SVG template and the TAIL / STATES
 * tables are the export's, verbatim. Parts carry the rig ids as data-part
 * (tail, feet, body, head, ears, eyes, mouth, paws, flame, doze, wake-mark).
 */
export type LenaState = "idle" | "idle-2" | "idle-3" | "alert" | "peek" | "hop" | "droop-then-nudge" | "doze" | "wake" | "hold-flame";

export interface LenaCharacterProps {
  state: LenaState;
  size?: number;
}

const TAIL: Record<string, string> = {
  up: "M136 152C186 150 192 78 152 62C132 54 120 80 138 96",
  flick: "M136 152C190 156 200 96 166 74C150 64 136 84 150 98",
  straight: "M136 150C170 130 178 70 150 48",
  wrap: "M136 152C180 170 150 190 100 182C70 178 60 160 70 150",
  low: "M136 152C186 160 202 112 178 98",
};

interface LenaSpec {
  tail?: string;
  headT?: string;
  bodyT?: string;
  eyes?: [number, number];
  earL?: string;
  earR?: string;
  eyeR?: number;
  pawL?: [number, number];
  pawR?: [number, number];
  feet?: [number, number];
  mouth?: "open";
  lids?: boolean;
  closed?: boolean;
  zz?: boolean;
  brow?: boolean;
  bang?: boolean;
  nudge?: boolean;
  flame?: boolean;
}

export const LENA_STATES: Record<LenaState, LenaSpec> = {
  idle: {},
  "idle-2": { tail: "flick" },
  "idle-3": { headT: "rotate(8 76 110)", eyes: [-2, 0] },
  alert: { bodyT: "translate(0 -6) scale(1 1.06)", tail: "straight", earL: "rotate(-6 58 79)", earR: "rotate(6 94 77)", eyeR: 7 },
  peek: { bodyT: "translate(-12 0) rotate(-8 100 176)", headT: "rotate(-10 76 110)", eyes: [-3, 1], pawL: [58, 132], pawR: [90, 160] },
  hop: { bodyT: "translate(0 -26)", tail: "straight", eyeR: 7, mouth: "open", feet: [86, 100], pawL: [70, 156], pawR: [92, 156] },
  "droop-then-nudge": { headT: "rotate(-12 76 110)", earL: "rotate(-45 58 79)", earR: "rotate(-40 94 77)", tail: "low", lids: true, pawL: [40, 150], nudge: true },
  doze: { bodyT: "translate(0 12) scale(1 .92)", tail: "wrap", earL: "rotate(-25 58 79)", earR: "rotate(-20 94 77)", closed: true, zz: true },
  wake: { bodyT: "translate(0 -4)", earL: "rotate(-10 58 79)", earR: "rotate(12 94 77)", eyeR: 7.5, brow: true, bang: true, mouth: "open" },
  "hold-flame": { eyes: [-3, 3], pawL: [56, 150], pawR: [62, 158], flame: true },
};

export default function LenaCharacter({ state, size = 48 }: LenaCharacterProps) {
  const s = LENA_STATES[state] ?? LENA_STATES.idle;
  const [dx, dy] = s.eyes ?? [0, 0];
  const r = s.closed ? 0 : (s.eyeR ?? 5.5);
  const pl = s.pawL ?? [74, 158];
  const pr = s.pawR ?? [90, 160];
  const ft = s.feet ?? [82, 106];
  const mouth = s.mouth === "open" ? "M52 108q5 7 10 0z" : "M54 108q4 3 8 0";
  const tailD = TAIL[s.tail ?? "up"]!;
  const lidD = s.closed ? "M62 92q6 4 12 0M83 90q5 4 10 0" : s.lids ? "M61 86q7-4 14 0M81 84q7-4 14 0" : "M0 0";
  const browD = s.brow ? "M82 76q6-4 12 0" : "M0 0";
  const hiOp = s.closed ? 0 : 1;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: "block", overflow: "visible", flex: "none" }} data-part="lena" data-lena-state={state}>
      <g transform={s.bodyT ?? ""}>
        <g data-part="tail">
          <path d={tailD} fill="none" stroke="#7A6247" strokeWidth="24" strokeLinecap="round" />
          <path d={tailD} fill="none" stroke="#B8A388" strokeWidth="7" strokeLinecap="round" strokeDasharray="14 12" />
        </g>
        <g data-part="feet">
          <ellipse cx={ft[0]} cy="174" rx="11" ry="5" fill="#6A5340" />
          <ellipse cx={ft[1]} cy="176" rx="11" ry="5" fill="#6A5340" />
        </g>
        <g data-part="body">
          <ellipse cx="100" cy="136" rx="40" ry="36" fill="#8C7455" />
          <path d="M112 106q8 30 4 62M124 110q12 26 8 54M134 118q12 22 8 40" fill="none" stroke="#EADFC8" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="86" cy="146" rx="20" ry="24" fill="#EADFC8" />
        </g>
        <g data-part="head" transform={s.headT ?? ""}>
          <g data-part="ears">
            <ellipse cx="58" cy="66" rx="8" ry="13" fill="#8C7455" transform={s.earL ?? ""} />
            <ellipse cx="58" cy="68" rx="4" ry="8" fill="#D9A08F" transform={s.earL ?? ""} />
            <ellipse cx="94" cy="64" rx="8" ry="13" fill="#8C7455" transform={s.earR ?? ""} />
            <ellipse cx="94" cy="66" rx="4" ry="8" fill="#D9A08F" transform={s.earR ?? ""} />
          </g>
          <circle cx="76" cy="94" r="30" fill="#8C7455" />
          <ellipse cx="60" cy="104" rx="14" ry="11" fill="#EADFC8" />
          <circle cx="50" cy="100" r="3.5" fill="#3A2A22" />
          <path d="M52 102L30 96M52 104L30 106M52 106L32 114" stroke="#3A2A22" strokeWidth="1.5" strokeLinecap="round" />
          <g data-part="eyes">
            <circle cx={68 + dx} cy={90 + dy} r={r} fill="#2A1C17" />
            <circle cx={88 + dx} cy={88 + dy} r={r} fill="#2A1C17" />
            <circle cx={70 + dx} cy={88 + dy} r="1.8" fill="#fff" opacity={hiOp} />
            <circle cx={90 + dx} cy={86 + dy} r="1.8" fill="#fff" opacity={hiOp} />
            <path d={lidD} fill="none" stroke="#2A1C17" strokeWidth="3" strokeLinecap="round" />
            <path d={browD} fill="none" stroke="#3A2A22" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <path data-part="mouth" d={mouth} fill={s.mouth === "open" ? "#3A2A22" : "none"} stroke="#3A2A22" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g data-part="paws">
          <ellipse cx={pl[0]} cy={pl[1]} rx="7" ry="5" fill="#6A5340" />
          <ellipse cx={pr[0]} cy={pr[1]} rx="7" ry="5" fill="#6A5340" />
        </g>
        {s.flame && (
          <g data-part="flame">
            <path d="M46 112c-18 22-14 48 4 48s24-22 10-36c2 12-8 16-10 8-4-8 2-14-4-20z" fill="#D9643A" />
            <path d="M50 136c-7 10-5 22 2 22s10-10 4-18c0 6-4 8-5 4-2-4 1-6-1-8z" fill="#E9B44C" />
          </g>
        )}
        {s.zz && (
          <g data-part="doze">
            <circle cx="112" cy="58" r="4" fill="none" stroke="#7A6247" strokeWidth="2" />
            <circle cx="124" cy="44" r="6" fill="none" stroke="#7A6247" strokeWidth="2" />
            <circle cx="140" cy="26" r="8" fill="none" stroke="#7A6247" strokeWidth="2" />
          </g>
        )}
        {s.bang && (
          <g data-part="wake-mark">
            <path d="M104 22v20" stroke="#E9B44C" strokeWidth="6" strokeLinecap="round" />
            <circle cx="104" cy="54" r="3.5" fill="#E9B44C" />
          </g>
        )}
        {s.nudge && <path d="M28 132q-8 10 0 20M18 126q-12 16 0 32" fill="none" stroke="#B8A388" strokeWidth="2.5" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
