import { Suspense } from "react";
import SearchClient from "./SearchClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-3 py-8 sm:px-4 text-mist">Loading search…</div>}>
      <SearchClient />
    </Suspense>
  );
}
