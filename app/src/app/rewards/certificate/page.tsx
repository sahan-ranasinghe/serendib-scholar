import { redirect } from "next/navigation";
import { CertificateScreen } from "@/components/app/screens/Certificate";
import { CertificateActions } from "@/components/app/CertificateActions";
import { hasActiveChild } from "@/lib/activeChild";
import { certificateData, loadChildState } from "@/lib/appData";

export const dynamic = "force-dynamic";

export default async function CertificatePage() {
  if (!(await hasActiveChild())) redirect("/onboarding/1");
  const state = await loadChildState();
  return <CertificateScreen data={certificateData(state)} actions={<CertificateActions />} />;
}
