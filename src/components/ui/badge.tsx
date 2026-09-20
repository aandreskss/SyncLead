import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        /* Estados de dominio: siempre acompañados de una palabra, nunca solo color */
        hot: "border-transparent bg-sg-hot/15 text-sg-hot",
        warm: "border-transparent bg-sg-warm/15 text-sg-warm",
        cold: "border-transparent bg-sg-cold/15 text-sg-cold",
        success: "border-transparent bg-sg-green/15 text-sg-green",
        info: "border-transparent bg-sg-cyan/15 text-sg-cyan",
        danger: "border-transparent bg-sg-danger/15 text-sg-danger",
        neutral: "border-transparent bg-sg-s3 text-sg-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
