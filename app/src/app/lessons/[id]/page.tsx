import { LessonDetailRoute } from "@/components/app/routes/routes";
import { LESSON_NAMES } from "@/lib/appCopy";

/** The catalogue's lesson numbers are static routes: fully prefetched, instant to open (cluster H). */
export function generateStaticParams() {
  const numbers = Object.keys(LESSON_NAMES);
  return (numbers.length ? numbers : ["1"]).map((id) => ({ id }));
}

/** `/lessons/[id]` — a static shell around the client route (see src/app/home/page.tsx). */
export default async function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonDetailRoute lessonNumber={Number(id)} />;
}
