import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2",
      "text-sm text-zinc-100 placeholder:text-zinc-500",
      "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
      "disabled:opacity-50 resize-none",
      className
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export { Textarea }
