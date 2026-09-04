import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/cn"

/*
 * Status badge. Spec: 10.5px / 700, 3px 8px, fully round, and always a soft
 * background paired with its own foreground — `--ok-soft` behind `--ok`, and so
 * on. Vocabulary: In stock, Low, Out, Udhaar, Cash, settled, 31d overdue.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-[3px] text-[10.5px] font-bold whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand",
        secondary: "bg-panel2 text-fg2",
        success: "bg-ok-soft text-ok",
        warning: "bg-warn-soft text-warn",
        destructive: "bg-bad-soft text-bad",
        outline: "border-line text-fg2",
        ghost: "[a&]:hover:bg-panel2",
        link: "text-brand underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
