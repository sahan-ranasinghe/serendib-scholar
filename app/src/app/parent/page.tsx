import { ParentZoneScreen } from "@/components/app/screens/ParentZone";
import { loadChildState, parentZoneData, profilesData } from "@/lib/appData";

export default async function ParentPage() {
  const state = await loadChildState();
  const profiles = await profilesData(state);
  return <ParentZoneScreen data={parentZoneData(state, profiles.childrenCount)} />;
}
