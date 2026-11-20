export function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`aurora-scene ${className}`.trim()} aria-hidden="true">
      <span className="aurora-orb aurora-orb-one" />
      <span className="aurora-orb aurora-orb-two" />
      <span className="aurora-orb aurora-orb-three" />
      <span className="aurora-grain" />
    </div>
  );
}
