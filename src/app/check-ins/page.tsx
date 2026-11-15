import type { Metadata } from "next";
import { CheckInList } from "@/components/checkin-list";

export const metadata: Metadata = { title: "Check-ins" };

export default function Page() {
  return <CheckInList />;
}
