import { DeviceGateClient } from "@/components/app/DeviceGateClient";

/**
 * `/device-gate` — the app's access-code entry, standing on its own. The proxy sends a device here when it asks for
 * the CMS panel without the device grant (src/proxy.ts, src/cms/routes.ts), and the gate sends it back afterwards.
 * A static shell, like every other page: the check and the redirect happen on the client.
 */
export default function Page() {
  return <DeviceGateClient />;
}
