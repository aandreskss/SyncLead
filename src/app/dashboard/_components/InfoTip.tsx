import { useId } from "react"
import { Info } from "lucide-react"

/**
 * Tooltip accesible solo con CSS: aparece con hover y con foco de teclado.
 * `align` evita que se salga del contenedor en los extremos.
 */
export function InfoTip({ label, children, align = "center" }: { label: string; children: React.ReactNode; align?: "left" | "center" | "right" }) {
  const id = useId()
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`Cómo se calcula: ${label}`}
        aria-describedby={id}
        className="flex h-5 w-5 items-center justify-center rounded text-ops-tx3 transition-colors duration-150 hover:text-ops-tx"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-60 rounded-lg border border-ops-bd2 bg-ops-raised px-3 py-2 text-left text-[13px] font-normal leading-snug text-ops-tx group-focus-within:block group-hover:block ${pos}`}
      >
        {children}
      </span>
    </span>
  )
}
