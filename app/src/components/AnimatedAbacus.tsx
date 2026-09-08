"use client";

/**
 * The animated abacus manipulative — the lesson's first real one.
 *
 * Rods labelled (දද) දා සි ද එ on a wooden base. Beads slide onto a rod one
 * at a time with a short spring; the number forms beneath the rods
 * digit-by-digit as rods fill. When the child answers, their number renders
 * in a second colour beneath for comparison.
 *
 * Driven entirely by props (from the `abacus` BoardContent, see board.ts):
 *   digits       target beads per rod
 *   shown        beads currently placed (abacus_add_bead raises it)
 *   selfAnimate  beads land rod by rod on their own (EXPLAIN staging)
 *   childAnswer  the child's number, second colour, or null
 */
import { useEffect, useRef, useState } from "react";

/** Right-aligned rod labels: … දස දහස, දහස, සිය, දහය, එක. */
const ROD_LABELS = ["ලක්", "දද", "දා", "සි", "ද", "එ"];

const BEAD_COLORS = ["#D9534F", "#E8A33D", "#4C9E6B", "#4A7DBF", "#8A5BB8"];
const SELF_ANIMATE_STEP_MS = 420;

export interface AnimatedAbacusProps {
  digits: number[];
  shown: number[];
  selfAnimate: boolean;
  childAnswer: string | null;
}

export default function AnimatedAbacus({ digits, shown, selfAnimate, childAnswer }: AnimatedAbacusProps) {
  // selfAnimate: an internal counter walks bead-by-bead (rod by rod) up to
  // `digits`, so beads land while she names each place. Otherwise the
  // parent's `shown` is authoritative (abacus_add_bead patches it).
  // The counter starts from `shown`, not from zero: a rod that already
  // carries its beads (built up by abacus_add_bead on earlier beats) keeps
  // them, and only the bare rods animate. Re-staging a half-built abacus
  // with animate used to re-land every rod — beads dropping onto rods the
  // child had just watched fill.
  const [selfShown, setSelfShown] = useState<number[]>(() => digits.map((d, i) => Math.min(d, shown[i] ?? 0)));
  const animKey = digits.join(",");
  const animKeyRef = useRef(animKey);
  useEffect(() => {
    if (!selfAnimate) return;
    if (animKeyRef.current !== animKey) {
      animKeyRef.current = animKey;
      setSelfShown(digits.map((d, i) => Math.min(d, shown[i] ?? 0)));
    }
    const timer = setInterval(() => {
      setSelfShown((current) => {
        const next = [...current];
        for (let rod = 0; rod < digits.length; rod += 1) {
          if (next[rod] < digits[rod]) {
            next[rod] += 1;
            return next;
          }
          // A zero rod still gets "visited" implicitly — nothing to land.
        }
        clearInterval(timer);
        return current;
      });
    }, SELF_ANIMATE_STEP_MS);
    return () => clearInterval(timer);
    // `shown` is deliberately not a dependency: it is the starting point,
    // read when the animation (re)starts, not a live input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfAnimate, animKey, digits]);

  const effectiveShown = selfAnimate ? selfShown : shown;
  const labels = ROD_LABELS.slice(ROD_LABELS.length - digits.length);

  return (
    <div className="flex w-full flex-col items-center gap-3" data-testid="animated-abacus">
      <div className="flex items-end justify-center gap-[4%]" style={{ width: "min(100%, 30rem)" }}>
        {digits.map((digit, rod) => (
          <div key={rod} className="flex min-w-0 flex-1 flex-col items-center">
            {/* the rod: a vertical pole beads stack onto */}
            <div className="relative flex h-40 w-full items-end justify-center sm:h-48">
              <div className="absolute bottom-0 h-full w-[6px] rounded-t-full bg-[#8B6B4A]" />
              <div className="relative flex flex-col-reverse items-center">
                {Array.from({ length: effectiveShown[rod] ?? 0 }).map((_, i) => (
                  <div
                    key={i}
                    className="abacus-bead -mb-[2px] h-5 w-9 rounded-full border border-black/15 sm:h-6 sm:w-11"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${BEAD_COLORS[rod % BEAD_COLORS.length]}dd, ${BEAD_COLORS[rod % BEAD_COLORS.length]})`,
                    }}
                  />
                ))}
              </div>
            </div>
            {/* rod label on the base */}
            <div className="mt-[2px] w-full rounded-b-md bg-[#A97E52] py-1 text-center text-sm font-bold text-[#3B2B1A] shadow-inner sm:text-base">
              {labels[rod]}
            </div>
            {/* the digit forms beneath as its rod completes */}
            <div className="mt-1 h-8 text-2xl font-extrabold text-emerald-700 sm:text-3xl" data-testid="abacus-digit">
              {(effectiveShown[rod] ?? 0) >= digit && (effectiveShown.slice(0, rod).every((s, r) => s >= digits[r]))
                ? digit
                : ""}
            </div>
          </div>
        ))}
      </div>
      {/* wooden base bar */}
      <div className="-mt-2 h-3 rounded-full bg-[#8B6B4A] shadow" style={{ width: "min(100%, 32rem)" }} />
      {/* the child's own number, second colour, for comparison */}
      {childAnswer && (
        <div className="text-xl font-bold text-sky-600 sm:text-2xl" data-testid="abacus-child-answer">
          ඔයාගේ උත්තරය: {childAnswer}
        </div>
      )}
      <style>{`
        .abacus-bead {
          animation: bead-land 360ms cubic-bezier(0.22, 1.5, 0.4, 1);
        }
        @keyframes bead-land {
          0% {
            transform: translateY(-90px) scale(0.9);
            opacity: 0.4;
          }
          70% {
            transform: translateY(4px) scale(1.04);
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
