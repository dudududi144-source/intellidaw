"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Features, Stats } from "@/components/landing/Features";
import { Instruments, SamplerKits } from "@/components/landing/Instruments";
import { Assistant, Mixing, Perform } from "@/components/landing/Showcase";
import { Details, HowItWorks } from "@/components/landing/Details";
import { Faq, FinalCta, Footer } from "@/components/landing/Faq";
import { Studio } from "@/components/daw/Studio";

export default function Home() {
  const [studioOpen, setStudioOpen] = useState(false);

  const openStudio = useCallback(() => setStudioOpen(true), []);
  const closeStudio = useCallback(() => setStudioOpen(false), []);

  const scrollTo = useCallback((id: string) => {
    setStudioOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // lock page scroll while the studio is open
  useEffect(() => {
    document.body.style.overflow = studioOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [studioOpen]);

  return (
    <div id="top" className="flex min-h-screen flex-col bg-[#0a0807] text-[#f0ece4]">
      <Nav onOpenStudio={openStudio} />
      <main className="flex-1">
        <Hero onOpenStudio={openStudio} onSeeInstruments={() => scrollTo("instruments")} />
        <Stats />
        <Features />
        <Instruments />
        <SamplerKits />
        <Assistant />
        <Mixing />
        <Perform />
        <Details />
        <HowItWorks />
        <Faq />
        <FinalCta onOpenStudio={openStudio} />
      </main>
      <Footer />
      {studioOpen && <Studio onClose={closeStudio} />}
    </div>
  );
}
