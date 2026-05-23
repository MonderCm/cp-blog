"use client";

import BouncingSignature from "./BouncingSignature";

interface NavbarProps {
  signature: string;
}

export default function Navbar({ signature }: NavbarProps) {
  return (
    <header className="relative z-30">
      <nav className="backdrop-blur-xl bg-background/60 border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-center">
          <BouncingSignature
            text={signature}
            className="text-gradient text-lg font-medium"
          />
        </div>
      </nav>
    </header>
  );
}