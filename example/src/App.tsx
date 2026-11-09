import { useEffect } from "react";
import { Toaster } from "@/ui";
import { useI18n } from "@/i18n";
import MushafPage from "@/mushaf/MushafPage";

/** The whole app is the mushaf. */
export function App() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t("common:appName")} — ${t("common:appTagline")}`;
  }, [t]);

  return (
    <>
      <MushafPage />
      <Toaster />
    </>
  );
}
