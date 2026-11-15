import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import { CareProvider } from "@/components/care-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
});

const note = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: "Caretaker Check-in",
    template: "%s · Caretaker Check-in",
  },
  description:
    "A calm daily note for someone looking after a relative who lives alone. Door and motion metadata, approved check-ins, and a browser agent network.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${note.variable} antialiased`}>
        <CareProvider>
          <Shell>{children}</Shell>
        </CareProvider>
      </body>
    </html>
  );
}
