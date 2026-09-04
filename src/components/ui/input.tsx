import * as React from "react"

import { cn } from "@/lib/cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Spec: --panel2 fill, --line border, 10–11px radius, 42–50px tall.
        // 16px on the phone so iOS does not zoom the field on focus.
        "h-11 w-full min-w-0 rounded-[11px] border border-line bg-panel2 px-3 text-base transition-[color,box-shadow] outline-none selection:bg-brand-soft selection:text-brand file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg placeholder:text-fg2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-[13.5px]",
        "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
