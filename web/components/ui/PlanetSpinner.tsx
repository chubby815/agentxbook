export default function PlanetSpinner({ label = "Loading your feed…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="planet-loader" aria-hidden />
      <p className="text-sm text-mist">{label}</p>
    </div>
  );
}
