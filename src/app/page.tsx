"use client";

import dynamic from "next/dynamic";

const PeakFlowDiary = dynamic(
  () => import("@/components/PeakFlowDiary").then((mod) => ({ default: mod.PeakFlowDiary })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
      </div>
    ),
  }
);

export default function Page() {
  return <PeakFlowDiary />;
}
