import { PinChangeClient } from "@/components/app/ParentClients";
import { loadChildState } from "@/lib/appData";

export default async function PinPage() {
  const state = await loadChildState();
  return <PinChangeClient pinSet={Boolean(state.extras.parentPinHash)} />;
}
