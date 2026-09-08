"use client";

/**
 * The top strip: the lesson's concepts as stops on a line. The current stop
 * fills as its beats pass; a stop whose concept is done lights up; a small
 * star lands on it when the concept was mastered.
 */
import { motion } from "framer-motion";

export interface ConceptStop {
  tag: string;
  title: string;
  status: "upcoming" | "current" | "done" | "mastered";
  /** 0..1 of the concept's beats passed. */
  fraction: number;
}

export function ProgressStrip({ stops }: { stops: ConceptStop[] }) {
  if (stops.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="progress-strip" aria-label="පාඩමේ කොටස්">
      {stops.map((stop, index) => {
        const lit = stop.status === "done" || stop.status === "mastered";
        return (
          <div key={stop.tag} className="flex items-center gap-1.5" data-stop={stop.tag} data-stop-status={stop.status} title={stop.title}>
            <div className="relative h-3 w-3">
              <div
                className={`absolute inset-0 rounded-full ${lit ? "bg-emerald-400" : stop.status === "current" ? "bg-white/25" : "bg-white/20"}`}
              />
              {stop.status === "current" && (
                <div className="absolute inset-0 overflow-hidden rounded-full" aria-hidden>
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-amber-400"
                    initial={false}
                    animate={{ width: `${Math.round(Math.max(0.12, stop.fraction) * 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
              {stop.status === "mastered" && (
                <motion.svg
                  viewBox="0 0 20 20"
                  className="absolute -top-2 -right-2 h-4 w-4"
                  initial={{ scale: 0, rotate: -30, y: -8 }}
                  animate={{ scale: 1, rotate: 0, y: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  data-testid="stop-star"
                  aria-label="ප්‍රවීණයි"
                >
                  <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z" fill="#F3C64B" stroke="#B8892B" strokeWidth="0.8" />
                </motion.svg>
              )}
            </div>
            {index < stops.length - 1 && <div className={`h-0.5 w-3 rounded ${lit ? "bg-emerald-400/70" : "bg-white/15"}`} />}
          </div>
        );
      })}
    </div>
  );
}
