import baseLogger from "@/features/shared/utils/logger";

const utilsLog = baseLogger.extend("auth-utils");
utilsLog.debug("[guest-username-generator] module loaded");

export function generateGuestUsername(
  firstName: string,
  lastName: string
): string {
  utilsLog.debug("[generateGuestUsername] called", {
    hasFirstName: Boolean(firstName?.trim()),
    hasLastName: Boolean(lastName?.trim()),
  });
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `${firstName.toLowerCase()}${
    lastName && "." + lastName.toLowerCase()
  }.${random}`;
}
