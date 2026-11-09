import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface SegmentedControlProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  /** With `icon` and `iconOnly`, the label is still the button's name (screen readers, tooltip). */
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  /** Read by screen readers: what is being chosen. */
  label: string;
  className?: string;
  size?: "default" | "sm";
  /** Draw only each option's icon: a compact switch for a card header on a phone. */
  iconOnly?: boolean;
}

/**
 * A small set of mutually exclusive choices (a period, a view) as one row of pills. Takes the room of a single
 * control, so it can stay visible on a phone where a select would hide the choice behind a tap.
 */
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  size = "default",
  iconOnly = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("surface-track inline-flex items-center gap-1 rounded-xl bg-foreground/[0.05] p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        const onlyIcon = iconOnly && Icon;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={onlyIcon ? option.label : undefined}
            title={onlyIcon ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              onlyIcon ? (size === "sm" ? "w-9" : "w-10") : "px-4",
              size === "sm" ? "h-9" : "h-10",
              selected
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className={cn("size-[1.15rem] shrink-0", selected && "text-primary")} aria-hidden />}
            {!onlyIcon && option.label}
          </button>
        );
      })}
    </div>
  );
}
