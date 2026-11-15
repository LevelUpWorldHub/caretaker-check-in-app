import type { Metadata } from "next";
import { AgentPanel } from "@/components/agent-panel";

export const metadata: Metadata = { title: "Companion" };

export default function Page() {
  return <AgentPanel />;
}
