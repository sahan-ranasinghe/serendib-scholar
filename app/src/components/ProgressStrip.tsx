"use client";

/**
 * The strip's concept stops, from the design: circles 10 px (the current
 * one 14 px), done ones filled green, the current saffron, the rest
 * transparent with a white-50 border, 7 px apart; a mastered stop carries
 * a small ★.
 */
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
    <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "0 10px" }} data-testid="progress-strip" aria-label="පාඩමේ කොටස්">
      {stops.map((stop) => {
        const done = stop.status === "done" || stop.status === "mastered";
        const current = stop.status === "current";
        const size = current ? 14 : 10;
        return (
          <span
            key={stop.tag}
            data-stop={stop.tag}
            data-stop-status={stop.status}
            title={stop.title}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: done ? "var(--color-success)" : current ? "var(--color-saffron)" : "transparent",
              border: `2px solid ${done ? "var(--color-success)" : current ? "var(--color-saffron)" : "rgba(255,255,255,.5)"}`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "700 8px/1 var(--font-latin)",
              color: "#fff",
            }}
          >
            {stop.status === "mastered" && (
              <span data-testid="stop-star" aria-label="ප්‍රවීණයි">
                ★
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
