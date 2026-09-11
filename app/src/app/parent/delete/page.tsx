import { DeleteClient } from "@/components/app/ParentClients";
import { loadChildState } from "@/lib/appData";

export default async function DeletePage() {
  const state = await loadChildState();
  return <DeleteClient childName={state.name} />;
}
