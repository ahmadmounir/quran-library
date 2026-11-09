import * as React from "react"

import { cn } from "@/lib/cn"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  dir?: "ltr" | "rtl" | "auto"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dir = "auto", ...props }, ref) => {
    return (
      <input
        type={type}
        dir={dir}
        className={cn(
          "surface-fill flex h-12 w-full px-4 py-2 rounded-xl border border-transparent bg-foreground/[0.05] text-base ring-offset-background transition-[background-color,border-color,box-shadow] hover:bg-foreground/[0.07] file:border-0 file:bg-transparent file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-card focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:bg-destructive/[0.04] aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/15",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }