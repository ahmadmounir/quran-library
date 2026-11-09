import { Toaster as Sonner } from "sonner";
import { useIsDark } from "@/settings/store";
import { useI18n } from "@/i18n";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** The toasts, in the reader's theme and direction */
const Toaster = (props: ToasterProps) => {
  const dark = useIsDark();
  const { isRTL } = useI18n();

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      dir={isRTL ? "rtl" : "ltr"}
      position="top-center"
      className="toaster group pointer-events-auto z-[100]"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      style={{ zIndex: 100 }}
      {...props}
    />
  );
};

export { Toaster };
