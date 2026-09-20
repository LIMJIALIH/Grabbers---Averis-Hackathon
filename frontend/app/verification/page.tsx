import type { Metadata } from "next";
import VerificationWorkspace from "@/components/VerificationWorkspace";

export const metadata: Metadata = {
  title: "Shipping Verification & Audit Trail | DocuVerify",
  description: "Shipping document verification with an in-memory audit trail and user action recorder.",
};

export default function VerificationPage() {
  return <VerificationWorkspace />;
}
