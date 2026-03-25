"use client";

import dynamic from "next/dynamic";

const StarField = dynamic(() => import("./StarField"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-0 bg-void bg-grid-space bg-[length:56px_56px]" aria-hidden />
  ),
});

export default function StarFieldDynamic() {
  return <StarField />;
}
