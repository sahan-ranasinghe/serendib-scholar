"use client";

/**
 * The card at the end of a sitting: what the child did today, in Sinhala,
 * from the session's mastery log — every concept touched, how many
 * questions were answered and how many were right, a star where the
 * concept was mastered. Styled with the design's paper sheet (no session
 * frame in the export shows it — reported as unreferenced).
 */
import { motion } from "framer-motion";

export interface SessionSummary {
  concepts: Array<{ tag: string; title: string; asked: number; correct: number; mastered: boolean }>;
  asked: number;
  correct: number;
  minutes: number;
}

export function SessionSummaryCard({ summary, onClose }: { summary: SessionSummary; onClose?: () => void }) {
  return (
    <motion.div
      style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,27,27,.38)", padding: 16 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      data-testid="session-summary"
    >
      <motion.div
        style={{ width: "100%", maxWidth: 480, borderRadius: 16, background: "var(--color-paper)", padding: "16px 20px", color: "var(--color-ink)", boxShadow: "var(--shadow-lift)", fontFamily: "var(--font-display)" }}
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.34, 1.3, 0.64, 1] }}
      >
        <h2 style={{ margin: 0, font: "700 26px/1.4 var(--font-display)", color: "var(--color-ink)" }}>අද ඔයා කළ දේවල් 🌟</h2>
        <p style={{ margin: "4px 0 0", font: "400 20px/1.5 var(--font-body)", color: "var(--color-ink-70)" }}>
          ප්‍රශ්න {summary.asked} කින් {summary.correct} ක් හරි · මිනිත්තු {summary.minutes} ක්
        </p>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {summary.concepts.map((concept) => (
            <li key={concept.tag} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, background: "var(--color-card)", padding: "6px 12px", font: "600 20px/1.5 var(--font-label)" }} data-testid="summary-concept">
              <span>{concept.title}</span>
              <span style={{ color: "var(--color-ink-70)" }}>
                {concept.asked > 0 ? `${concept.correct}/${concept.asked}` : "බැලුවා"} {concept.mastered ? "⭐" : ""}
              </span>
            </li>
          ))}
        </ul>
        <p style={{ margin: "16px 0 0", textAlign: "center", font: "700 22px/1.5 var(--font-display)", color: "var(--color-success-text)" }}>ඊළඟ පාරටත් බලමු!</p>
        {onClose && (
          <button type="button" onClick={onClose} style={{ marginTop: 12, width: "100%", height: 56, border: 0, borderRadius: 12, background: "var(--color-teal)", color: "#fff", font: "700 24px/1.5 var(--font-display)", boxShadow: "var(--shadow-button)", cursor: "pointer" }}>
            හරි
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
