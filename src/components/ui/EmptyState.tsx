"use client";
import Link from "next/link";
import { Upload, ArrowRight } from "lucide-react";

interface Props {
  title?: string;
  message?: string;
}

export function EmptyState({
  title = "No schedule imported yet",
  message = "Import a Primavera P6 (XER/XML) or Microsoft Project XML file to populate dashboards, run DCMA, and view critical path analysis.",
}: Props) {
  return (
    <div className="max-w-2xl mx-auto pt-12 pb-16">
      <div className="bg-card border border-border rounded-2xl p-10 text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5 shadow-glow-blue">
          <Upload size={26} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto mb-6 leading-relaxed">{message}</p>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity shadow-glow-blue"
        >
          Import schedule
          <ArrowRight size={14} />
        </Link>
        <div className="mt-6 text-[11px] text-text-secondary">
          Supported: <span className="font-mono">.xer</span> · Primavera P6 XML · Microsoft Project XML
        </div>
      </div>
    </div>
  );
}
