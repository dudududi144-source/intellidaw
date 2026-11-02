import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Intellidaw — Free Online Music Studio & DAW in Your Browser",
  description:
    "Intellidaw is a free online DAW: a full music studio in your browser with six instruments, a 16-pad sampler, drums, a mixer and an assistant that reads your song. Nothing to install.",
  keywords: [
    "online DAW",
    "music studio",
    "browser DAW",
    "beat maker",
    "sampler",
    "synth",
    "drum machine",
    "piano roll",
    "free music software",
  ],
  authors: [{ name: "Intellidaw" }],
  openGraph: {
    title: "Intellidaw — Make the track in your head",
    description:
      "A full music studio in your browser. Six instruments, a 16-pad sampler, drums, a mixer and an assistant that reads your song. Free, no login.",
    siteName: "Intellidaw",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0807",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
