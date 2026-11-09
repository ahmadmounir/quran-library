import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/cn"
import { useI18n } from "@/i18n"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-card p-6 shadow-lift transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        // Drawn by BottomSheetContent (its own classes); kept here for the `side` type
        bottom: "inset-x-0 bottom-0",
        left: "inset-y-0 start-0 h-full w-3/4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 end-0 h-full w-3/4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** The bottom sheet's dimming (e.g. lighter and unblurred, when what is behind it must stay readable) */
  overlayClassName?: string
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, overlayClassName, children, ...props }, ref) =>
  side === "bottom" ? (
    <BottomSheetContent ref={ref} className={className} overlayClassName={overlayClassName} {...props}>
      {children}
    </BottomSheetContent>
  ) : (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute end-4 top-4 grid size-9 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
)
SheetContent.displayName = SheetPrimitive.Content.displayName

/** A pull downwards longer than this share of the sheet's height, or faster than this (px/ms), closes it */
const CLOSE_DISTANCE = 0.25
const CLOSE_SPEED = 0.4
const SETTLE = "0.35s cubic-bezier(0.32, 0.72, 0, 1)"
/** Where a finger means something else than moving the sheet */
const NO_DRAG = "input, textarea, select, [contenteditable='true'], [role='slider'], [data-sheet-no-drag]"

interface Drag {
  startX: number
  startY: number
  lastY: number
  lastTime: number
  speed: number
  moving: boolean
}

const startDrag = (x: number, y: number, time: number): Drag => ({
  startX: x,
  startY: y,
  lastY: y,
  lastTime: time,
  speed: 0,
  moving: false,
})

/** The sheet (and the dimming above it) follow the finger; never above where it rests. */
function follow(sheet: HTMLElement, overlay: HTMLElement | null, drag: Drag, y: number, time: number) {
  if (time > drag.lastTime) drag.speed = (y - drag.lastY) / (time - drag.lastTime)
  drag.lastY = y
  drag.lastTime = time
  const offset = Math.max(0, y - drag.startY)
  sheet.style.transition = "none"
  sheet.style.transform = `translate3d(0, ${offset}px, 0)`
  if (overlay) {
    overlay.style.transition = "none"
    overlay.style.opacity = String(1 - Math.min(1, offset / sheet.offsetHeight))
  }
}

/**
 * The phone's bottom sheet: slides up, and goes away by a swipe down (the sheet follows the finger, then slides
 * out or back), a tap on the dimmed space, Escape or the grabber — which is also its accessible close button, so
 * there is no X. A swipe moves the sheet only while its content (and whatever scrolls under the finger) is at the
 * top; otherwise the finger scrolls as usual. A mouse drags it by the grabber.
 */
const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  Omit<SheetContentProps, "side">
>(({ className, overlayClassName, children, ...props }, ref) => {
  const { t } = useI18n()
  const [sheet, setSheet] = React.useState<HTMLDivElement | null>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const grabberRef = React.useRef<HTMLButtonElement>(null)
  const mouseDrag = React.useRef<Drag | null>(null)
  // Set by a drag, so the click that may follow it is not taken for a tap on the grabber
  const dragged = React.useRef(false)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setSheet(node)
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  const release = React.useCallback(
    (drag: Drag, time: number) => {
      if (!sheet) return
      const offset = drag.lastY - drag.startY
      // A finger that stopped before letting go is not a flick
      const speed = time - drag.lastTime > 100 ? 0 : drag.speed
      if (offset > sheet.offsetHeight * CLOSE_DISTANCE || (speed > CLOSE_SPEED && offset > 24)) {
        // Closing leaves the sheet where the finger left it; the closing animation starts from there
        dragged.current = false
        grabberRef.current?.click()
      } else {
        dragged.current = true
        sheet.style.transition = `transform ${SETTLE}`
        sheet.style.transform = ""
        const overlay = overlayRef.current
        if (overlay) {
          overlay.style.transition = `opacity ${SETTLE}`
          overlay.style.opacity = ""
        }
      }
    },
    [sheet]
  )

  // Touch: native listeners, because only a non-passive touchmove can keep the page from scrolling
  React.useEffect(() => {
    if (!sheet) return
    let drag: Drag | null = null

    const atTop = (target: Element) => {
      for (let el: Element | null = target; el; el = el === sheet ? null : el.parentElement) {
        if (el.scrollTop > 0) return false
      }
      return true
    }

    const onStart = (event: TouchEvent) => {
      dragged.current = false
      const target = event.target as Element
      const touch = event.touches[0]
      drag =
        event.touches.length === 1 && !target.closest(NO_DRAG) && atTop(target)
          ? startDrag(touch.clientX, touch.clientY, event.timeStamp)
          : null
    }

    const onMove = (event: TouchEvent) => {
      if (!drag) return
      const touch = event.touches[0]
      if (!drag.moving) {
        const dx = touch.clientX - drag.startX
        const dy = touch.clientY - drag.startY
        if (dx === 0 && dy === 0) return
        // Only a pull downwards (more down than sideways) moves the sheet; anything else scrolls as usual
        if (dy <= 0 || Math.abs(dx) > dy || !event.cancelable) {
          drag = null
          return
        }
        drag.moving = true
      }
      event.preventDefault()
      follow(sheet, overlayRef.current, drag, touch.clientY, event.timeStamp)
    }

    const onEnd = (event: TouchEvent) => {
      if (drag?.moving) release(drag, event.timeStamp)
      drag = null
    }

    sheet.addEventListener("touchstart", onStart, { passive: true })
    sheet.addEventListener("touchmove", onMove, { passive: false })
    sheet.addEventListener("touchend", onEnd)
    sheet.addEventListener("touchcancel", onEnd)
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      sheet.removeEventListener("touchend", onEnd)
      sheet.removeEventListener("touchcancel", onEnd)
    }
  }, [sheet, release])

  return (
    <SheetPortal>
      <SheetOverlay
        ref={overlayRef}
        className={cn(
          "data-[state=open]:animate-sheet-overlay-in data-[state=closed]:animate-sheet-overlay-out motion-reduce:animate-none",
          overlayClassName
        )}
      />
      <SheetPrimitive.Content
        ref={setRefs}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift will-change-transform data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        <SheetPrimitive.Close
          ref={grabberRef}
          aria-label={t("common:close")}
          className="mx-auto -mt-1 mb-2 flex h-6 w-24 cursor-grab touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          onPointerDown={(event) => {
            dragged.current = false
            if (event.pointerType === "touch" || event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            mouseDrag.current = startDrag(event.clientX, event.clientY, event.timeStamp)
          }}
          onPointerMove={(event) => {
            const drag = mouseDrag.current
            if (!drag || !sheet) return
            if (!drag.moving && Math.abs(event.clientY - drag.startY) < 4) return
            drag.moving = true
            follow(sheet, overlayRef.current, drag, event.clientY, event.timeStamp)
          }}
          onPointerUp={(event) => {
            const drag = mouseDrag.current
            mouseDrag.current = null
            if (drag?.moving) release(drag, event.timeStamp)
          }}
          onPointerCancel={(event) => {
            const drag = mouseDrag.current
            mouseDrag.current = null
            if (drag?.moving) release({ ...drag, lastY: drag.startY }, event.timeStamp)
          }}
          onClick={(event) => {
            // The click that ends a drag which put the sheet back is not a tap
            if (dragged.current) {
              dragged.current = false
              event.preventDefault()
            }
          }}
          onKeyDown={() => {
            dragged.current = false
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
BottomSheetContent.displayName = "BottomSheetContent"

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-start",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-md font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn(" text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}