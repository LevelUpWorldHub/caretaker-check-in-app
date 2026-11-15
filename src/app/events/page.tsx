import type { Metadata } from "next";
import { EventList } from "@/components/event-list";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return <EventList />;
}
