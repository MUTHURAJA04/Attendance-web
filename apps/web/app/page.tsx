import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <nav className="top-nav static border-b-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded" />
          <span className="font-bold text-xl">Attendance & Payroll</span>
        </div>
        <div className="flex gap-4">
          <Link href="/login" className="button button-secondary">Sign In</Link>
          <button className="button button-primary">Request Demo</button>
        </div>
      </nav>

      <div className="page-container pt-32 text-center">
        <h1 className="text-5xl md:text-6xl max-w-[800px] mx-auto mb-6">
          Modern Payroll for <span className="text-muted-foreground">Multi-Branch</span> Operations.
        </h1>
        <p className="text-xl max-w-[600px] mx-auto mb-12 text-muted-foreground">
          Centralized attendance, compliant Indian payroll, and sales-linked incentives
          designed for the modern restaurant industry.
        </p>

        <div className="flex justify-center gap-4">
          <Link href="/dashboard" className="button button-primary px-8 h-12 text-base">
            Go to Dashboard
          </Link>
          <button className="button button-secondary px-8 h-12 text-base">
            Learn More
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
          <div className="card text-left">
            <div className="text-3xl mb-4">🕒</div>
            <h3>Biometric Sync</h3>
            <p>Direct integration with Face ID and Fingerprint devices across all branches.</p>
          </div>
          <div className="card text-left">
            <div className="text-3xl mb-4">💰</div>
            <h3>Smart Payroll</h3>
            <p>Automated PF, ESI, PT, and TDS calculations following Indian compliance rules.</p>
          </div>
          <div className="card text-left">
            <div className="text-3xl mb-4">📈</div>
            <h3>Incentive Engine</h3>
            <p>Drive performance with incentives linked directly to branch daily sales.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
