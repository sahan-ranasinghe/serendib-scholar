"use client";

import { useState } from "react";

/**
 * Scaffold only — collects the basics needed before a child's first session.
 * Not wired to Supabase yet; submit currently just logs the payload.
 */
export default function ParentOnboarding() {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("5");
  const [subjects, setSubjects] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // TODO: persist to Supabase (children table) once schema is finalized.
    console.log("[ParentOnboarding] submit:", { name, grade, subjects });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Let&apos;s set things up</h1>
        <p className="mt-1 text-sm text-zinc-600">
          A few quick questions so we can tailor your child&apos;s study sessions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Child&apos;s name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-orange-400 focus:outline-none"
            placeholder="e.g. Sithumi"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Grade</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-orange-400 focus:outline-none"
          >
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            Subjects they&apos;re struggling with
          </span>
          <input
            type="text"
            value={subjects}
            onChange={(e) => setSubjects(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-orange-400 focus:outline-none"
            placeholder="e.g. Maths, Environmental Studies"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-lg bg-orange-500 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-orange-600"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
