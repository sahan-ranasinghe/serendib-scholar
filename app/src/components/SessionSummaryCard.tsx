"use client";

/**
 * The card at the end of a sitting: what the child did today, in Sinhala,
 * from the session's mastery log — every concept touched, how many
 * questions were answered and how many were right, a star where the
 * concept was mastered.
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
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#26414e]/85 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      data-testid="session-summary"
    >
      <motion.div
        className="font-sinhala w-full max-w-md rounded-3xl bg-[#FFFBF0] px-6 py-5 text-stone-800 shadow-2xl"
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        <h2 className="text-xl font-extrabold text-[#1E4C99]">අද ඔයා කළ දේවල් 🌟</h2>
        <p className="mt-1 text-sm text-stone-600">
          ප්‍රශ්න {summary.asked} කින් {summary.correct} ක් හරි · මිනිත්තු {summary.minutes} ක්
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {summary.concepts.map((concept) => (
            <li key={concept.tag} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm" data-testid="summary-concept">
              <span className="font-semibold">{concept.title}</span>
              <span className="text-sm text-stone-600">
                {concept.asked > 0 ? `${concept.correct}/${concept.asked}` : "බැලුවා"} {concept.mastered ? "⭐" : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-base font-bold text-[#2F7A4D]">ඊළඟ පාරටත් බලමු!</p>
        {onClose && (
          <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-[#1E4C99] py-2 font-bold text-white">
            හරි
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
