"use client";

import { useState } from "react";
import type { Faq } from "@/lib/api";
import { WHATSAPP_URL } from "@/lib/constants";
import Reveal from "./Reveal";
import { ChevronDown } from "./icons";

// Seção "Perguntas frequentes" - existia no Dr. Alecrim.dc.html original mas
// nunca tinha sido portada para o Next.js (ver PLANO-MIGRACAO.md). O mockup
// usava um loop de template sem conteúdo real (`{{ faqs }}` vazio); as
// perguntas/respostas abaixo vêm do backend (tabela `faqs`, ver seed.py).
export default function FAQ({ faqs }: { faqs: Faq[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="ba-paper px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mx-auto mb-12 max-w-xl text-center sm:mb-16">
          <p className="ba-eyebrow mb-5">Dúvidas</p>
          <h2 className="mb-4 text-ba-cta uppercase text-ba-bg [text-wrap:balance]">Perguntas frequentes</h2>
          <p className="text-ba-body text-ba-slate">O que os clientes perguntam antes de fechar.</p>
        </Reveal>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, index) => {
            const isOpen = openId === faq.id;
            return (
              <Reveal key={faq.id} delay={index * 60}>
                <div
                  className={`overflow-hidden border bg-white transition-colors duration-300 ${
                    isOpen ? "border-ba-accent/60" : "border-ba-steel/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 px-6 py-5 text-left sm:px-7"
                  >
                    <span className="flex-1 text-sm font-bold leading-snug text-ba-bg sm:text-base">
                      {faq.question}
                    </span>
                    <span
                      className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-ba-mist transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <ChevronDown className="text-ba-accent-ink" size={15} />
                    </span>
                  </button>
                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-ba-body-sm text-ba-slate sm:px-7">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-10 text-center sm:mt-14">
          <p className="mb-5 text-sm text-ba-slate">Ficou com outra dúvida?</p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ba-btn ba-btn-outline"
          >
            Falar com o Dr. Alecrim
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
