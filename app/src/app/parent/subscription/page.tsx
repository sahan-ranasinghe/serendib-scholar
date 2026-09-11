import { SubscriptionScreen } from "@/components/app/screens/ParentZone";
import { loadChildState, profilesData } from "@/lib/appData";

export default async function SubscriptionPage() {
  const state = await loadChildState();
  return <SubscriptionScreen profiles={await profilesData(state)} />;
}
