import { toast } from "sonner";

export { toast };

const defaultOptions = { closeButton: true };

export const showToast = {
  success: (message: string) => toast.success(message, defaultOptions),
  error: (message: string) => toast.error(message, defaultOptions),
  info: (message: string) => toast.info(message, defaultOptions),
  warning: (message: string) => toast.warning(message, defaultOptions),
  default: (message: string) => toast(message, defaultOptions),
};
