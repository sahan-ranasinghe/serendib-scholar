import { SplashScreen } from "@/components/app/screens/Splash";
import { SplashStart } from "@/components/app/SplashStart";
import { ChildChooser } from "@/components/app/ChildChooser";
import { childrenOnDevice } from "@/lib/activeChild";

export const dynamic = "force-dynamic";

/**
 * `/` — splash + language. Identity is device-bound: no child on this
 * device → "පටන් ගමු" goes to onboarding; one child → home; more than one
 * → the chooser (switch child) sits in the language card.
 */
export default async function SplashPage() {
  const kids = await childrenOnDevice();
  const next = kids.length === 0 ? "/onboarding/1" : "/home";
  return <SplashScreen start={kids.length > 1 ? <ChildChooser kids={kids} /> : <SplashStart href={next} />} />;
}
