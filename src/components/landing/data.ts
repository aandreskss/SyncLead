export type Heat = "Frío" | "Tibio" | "Caliente"

export const HEAT_CLS: Record<Heat, string> = {
  Caliente: "border-sg-hot/50 bg-sg-hot/10 text-sg-hot",
  Tibio: "border-sg-warm/50 bg-sg-warm/10 text-sg-warm",
  Frío: "border-sg-cold/50 bg-sg-cold/10 text-sg-cold",
}

export const FUNNEL = [
  { name: "Nuevo", n: 870 },
  { name: "Contactado", n: 512 },
  { name: "Interesado", n: 231 },
  { name: "Cotizado", n: 118 },
  { name: "Ganado", n: 51 },
]

export const LEADS: { name: string; ad: string; heat: Heat; rep: string; when: string }[] = [
  { name: "Mariana López", ad: "Video testimonio 02", heat: "Caliente", rep: "Andrea", when: "hace 3 min" },
  { name: "Diego Rivas", ad: "Carrusel catálogo", heat: "Tibio", rep: "Luis", when: "hace 18 min" },
  { name: "Camila Ortega", ad: "Reels precios", heat: "Frío", rep: "Sin asignar", when: "hace 42 min" },
  { name: "Tomás Herrera", ad: "Video testimonio 02", heat: "Caliente", rep: "Andrea", when: "hace 1 h" },
  { name: "Valentina Cruz", ad: "Carrusel catálogo", heat: "Tibio", rep: "Camila", when: "hace 2 h" },
]

export const ROWS = [
  { camp: "Ventas septiembre", ad: "Video testimonio 02", leads: 412, sales: 31, conv: "5,9 %", rev: "USD 7.719", cpl: "USD 2,91", cpa: "USD 38,71", roas: "6,43x" },
  { camp: "Ventas septiembre", ad: "Carrusel catálogo", leads: 268, sales: 14, conv: "5,2 %", rev: "USD 3.486", cpl: "USD 3,66", cpa: "USD 70,00", roas: "3,56x" },
  { camp: "Captación agosto", ad: "Reels precios", leads: 190, sales: 6, conv: "3,2 %", rev: "USD 1.494", cpl: "USD 3,21", cpa: "USD 101,67", roas: "2,45x" },
]

export const DAYS = [
  { d: "Lun", l: 104, s: 5 },
  { d: "Mar", l: 112, s: 6 },
  { d: "Mié", l: 108, s: 6 },
  { d: "Jue", l: 126, s: 8 },
  { d: "Vie", l: 131, s: 8 },
  { d: "Sáb", l: 142, s: 9 },
  { d: "Dom", l: 147, s: 9 },
]
