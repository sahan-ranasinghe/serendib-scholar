import { redirect } from "next/navigation";
import { QuizClient } from "@/components/app/QuizClient";

export default async function QuizPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const concept = typeof params.concept === "string" ? params.concept : "";
  if (!concept) redirect("/practice");
  return <QuizClient concept={concept} />;
}
