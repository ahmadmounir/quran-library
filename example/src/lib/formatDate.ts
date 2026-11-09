/** A date for people: "9 November 2026" in the reader's language (Arabic with Western digits, as in the app) */
export const formatDate = (value: string | number | Date, language: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "ar" ? "ar-u-nu-latn" : language;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
};
