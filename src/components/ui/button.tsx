import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[11px] text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one accent-coloured action per view, with the ambient glow.
        default: "bg-brand text-on-brand shadow-glow hover:bg-brand/90",
        destructive:
          "border border-bad bg-transparent text-bad hover:bg-bad-soft focus-visible:ring-bad/30",
        outline: "border border-line bg-panel2 text-fg hover:bg-line/60",
        secondary: "border border-line bg-panel2 text-fg hover:bg-line/60",
        ghost: "font-bold text-brand hover:bg-brand-soft",
        muted: "text-fg2 hover:bg-panel2 hover:text-fg",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        // Touch floor per the spec: primary 46–54px, secondary 40–46px,
        // nothing tappable below 34px.
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        xs: "h-8 gap-1 rounded-md px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1.5 rounded-[10px] px-3.5 text-[12.5px] has-[>svg]:px-3",
        lg: "h-[52px] rounded-xl px-7 text-[15px] has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-[10px]",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
