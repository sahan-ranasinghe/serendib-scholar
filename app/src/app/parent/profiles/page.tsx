import { ProfilesClient } from "@/components/app/ParentClients";
import { loadChildState, profilesData } from "@/lib/appData";

export default async function ProfilesPage() {
  const state = await loadChildState();
  return <ProfilesClient profiles={await profilesData(state)} />;
}
