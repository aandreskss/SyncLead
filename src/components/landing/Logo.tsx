import Link from "next/link"

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="SyncLead, inicio" className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-sg-accent text-sg-on-accent shadow-sg-glow"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 3 4 14h7l-1 7 9-11h-7z" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">SyncLead</span>
    </Link>
  )
}
