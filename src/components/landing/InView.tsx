"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/** Marca el bloque con data-inview para pausar animaciones ambientales fuera de pantalla. */
export function InView({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} data-inview={inView} className={`sg-signal ${className}`}>
      {children}
    </div>
  )
}
