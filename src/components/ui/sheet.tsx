"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("sg-scrim fixed inset-0 z-50 bg-[rgb(4_6_12/0.66)]", className)}
    {...props}
  />
))
SheetOverlay.displayName = "SheetOverlay"

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "sg-app sg-sheet fixed z-50 inset-y-0 right-0 h-full w-full sm:max-w-xl",
        "flex flex-col bg-sg-elev text-sg-ink border-l border-sg-border shadow-sg-float sm:rounded-l-3xl",
        "focus:outline-none",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="sg-press absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-sg-muted transition-colors hover:bg-sg-s3 hover:text-sg-ink">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = "SheetContent"

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4 border-b border-sg-border", className)} {...props} />
}

function SheetTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold tracking-tight text-sg-ink pr-12", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5 space-y-6", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetHeader, SheetTitle, SheetBody }
