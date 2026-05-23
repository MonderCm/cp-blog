"use client";

import { motion } from "framer-motion";

interface BouncingSignatureProps {
  text: string;
  className?: string;
}

export default function BouncingSignature({
  text,
  className = "",
}: BouncingSignatureProps) {
  const letters = text.split("");

  const container = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const child = {
    hidden: { y: 0 },
    visible: {
      y: [0, -12, 0],
      transition: {
        duration: 1.8,
        repeat: Infinity,
        repeatDelay: 1,
        ease: "easeInOut" as const,
      },
    },
  };

  return (
    <motion.div
      className={`inline-flex flex-wrap justify-center ${className}`}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {letters.map((letter, index) => (
        <motion.span
          key={index}
          variants={child}
          className="inline-block"
          style={{ whiteSpace: letter === " " ? "pre" : undefined }}
        >
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
      ))}
    </motion.div>
  );
}