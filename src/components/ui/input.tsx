import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-lg border border-muted/30 bg-surface px-4 py-2 text-base font-medium shadow-sm transition-all duration-200 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50",
          type === "number" && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
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
