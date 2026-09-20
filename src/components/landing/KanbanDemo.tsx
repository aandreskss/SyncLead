"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { HeatBadge, Sample } from "./ui"
import type { Heat } from "./data"

const COLS = ["Nuevo", "Contactado", "Interesado", "Cotizado", "Ganado"]

type Card = { id: number; n: string; a: string; s: string; h: Heat; c: number }

const INITIAL: Card[] = [
  { id: 1, n: "Mariana López", h: "Caliente", s: "Andrea", a: "Video testimonio 02", c: 0 },
  { id: 2, n: "Diego Rivas", h: "Tibio", s: "Luis", a: "Carrusel catálogo", c: 1 },
  { id: 3, n: "Camila Ortega", h: "Frío", s: "Sin asignar", a: "Reels precios", c: 0 },
  { id: 4, n: "Tomás Herrera", h: "Caliente", s: "Andrea", a: "Video testimonio 02", c: 2 },
  { id: 5, n: "Valentina Cruz", h: "Tibio", s: "Camila", a: "Carrusel catálogo", c: 3 },
  { id: 6, n: "Andrés Molina", h: "Caliente", s: "Luis", a: "Video testimonio 02", c: 4 },
]

export function KanbanDemo() {
  const [cards, setCards] = useState<Card[]>(INITIAL)
  const [live, setLive] = useState("")

  function move(id: number, dir: -1 | 1) {
    const card = cards.find((c) => c.id === id)
    if (!card) return
    const next = Math.min(Math.max(card.c + dir, 0), COLS.length - 1)
    if (next === card.c) return
    setCards(cards.map((c) => (c.id === id ? { ...c, c: next } : c)))
    setLive(`${card.n} movido a ${COLS[next]}`)
  }

  return (
    <div className="rounded-2xl border border-sg-border bg-sg-s1 p-4 shadow-sg-raise sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Funnel interactivo</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setCards(INITIAL)
              setLive("Demo reiniciada")
            }}
            className="rounded-md px-2 py-1 text-xs text-sg-muted hover:text-sg-ink"
          >
            Reiniciar
          </button>
          <Sample />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLS.map((name, ci) => {
          const items = cards.filter((c) => c.c === ci)
          return (
            <section
              key={name}
              aria-label={`Etapa ${name}`}
              className={`rounded-xl border bg-sg-bg p-2.5 ${ci === 4 ? "border-sg-green/60" : "border-sg-border"}`}
            >
              <h4 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-sg-muted">
                {name}
                <span className="sg-tabular font-mono text-sg-subtle">{items.length}</span>
              </h4>
              <ul className="min-h-[4rem] space-y-2">
                {items.map((c) => (
                  <li key={c.id} className="sg-rise rounded-lg border border-sg-border bg-sg-s2 p-2.5">
                    <p className="text-[13px] font-medium">{c.n}</p>
                    <p className="mt-0.5 text-[11px] text-sg-subtle">{c.a}</p>
                    <p className="text-[11px] text-sg-muted">{c.s}</p>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <HeatBadge heat={c.h} />
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={ci === 0}
                          onClick={() => move(c.id, -1)}
                          aria-label={`Mover ${c.n} a la etapa anterior`}
                          className="sg-press flex h-11 w-11 items-center justify-center rounded-lg border border-sg-border-strong/50 bg-sg-s3 text-sg-ink disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={ci === COLS.length - 1}
                          onClick={() => move(c.id, 1)}
                          aria-label={`Mover ${c.n} a la etapa siguiente`}
                          className="sg-press flex h-11 w-11 items-center justify-center rounded-lg border border-sg-border-strong/50 bg-sg-s3 text-sg-ink disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>
    </div>
  )
}
