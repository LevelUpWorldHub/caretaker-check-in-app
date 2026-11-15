import type { Metadata } from "next";
import { HealthPanel } from "@/components/health-panel";

export const metadata: Metadata = { title: "Health" };

export default function Page() {
  return <HealthPanel />;
}
