import { SplashScreen } from "@/components/app/screens/Splash";
import { SplashStart } from "@/components/app/SplashStart";

/** `/` — splash + language → home. The app opens here, not into the lesson. */
export default function SplashPage() {
  return <SplashScreen start={<SplashStart />} />;
}
