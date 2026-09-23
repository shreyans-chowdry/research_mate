export default function HomePage() {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <div className="text-center space-y-6 animate-fade-in">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          <span className="gradient-text">ResearchMate</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Autonomous Literature Gap Synthesis — powered by multi-agent AI
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground/60">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>Step 2 will add the full hero interface & search bar</span>
        </div>
      </div>
    </div>
  );
}
