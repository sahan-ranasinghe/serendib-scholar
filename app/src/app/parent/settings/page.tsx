import { SettingsClient } from "@/components/app/ParentClients";
import { loadChildState } from "@/lib/appData";

export default async function SettingsPage() {
  const state = await loadChildState();
  return <SettingsClient settings={state.extras.settings} source={state.extras.source} />;
}
