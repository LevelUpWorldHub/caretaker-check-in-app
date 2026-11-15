import type { Metadata } from "next";
import { RoutineForm } from "@/components/routine-form";

export const metadata: Metadata = { title: "Routine" };

export default function Page() {
  return <RoutineForm />;
}
