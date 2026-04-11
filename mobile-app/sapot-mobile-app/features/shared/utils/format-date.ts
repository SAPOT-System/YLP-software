import baseLogger from "./logger";

const utilLog = baseLogger.extend("util");
utilLog.debug("[format-date] module loaded");

export const formatDate = (date: Date) => {
  utilLog.debug("[formatDate] called", { hasDate: Boolean(date) });
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return formatter.format(date);
};
