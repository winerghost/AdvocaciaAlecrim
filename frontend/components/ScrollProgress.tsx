"use client";

import { useEffect, useState } from "react";

// Barra fina no topo mostrando o quanto da página já foi rolado - mesmo
// efeito da landing original (setProgressRef), refeito sem GSAP.
export default function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    function update() {
      const scrollTop = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, (scrollTop / scrollable) * 100) : 0);
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-hidden="true"
      className="fixed left-0 top-0 z-[100] h-[3px] bg-gradient-to-r from-gold to-gold-dark"
      style={{ width: `${progress}%`, transition: "width 0.15s ease-out" }}
    />
  );
}
