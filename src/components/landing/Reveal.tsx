"use client"

import { useEffect, useRef, type ElementType, type ReactNode } from "react"

/**
 * Entrada al hacer scroll. El HTML del servidor es visible (sin JS no se oculta
 * nada); en cliente, solo lo que está bajo el pliegue se oculta y se revela al
 * entrar en el viewport. Con reduced-motion el CSS lo deja siempre visible.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: ElementType
}) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.95) return
    el.dataset.shown = "false"
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.shown = "true"
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${className}`}
      style={{ ["--lp-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}
