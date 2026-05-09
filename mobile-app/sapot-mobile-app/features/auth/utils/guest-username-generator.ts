import { authUtilsLog } from "@/features/shared/utils/logger";

authUtilsLog.debug("[guest-username-generator] module loaded");

export function generateGuestUsername(
  firstName: string,
  lastName: string
): string {
  authUtilsLog.debug("[generateGuestUsername] called", {
    hasFirstName: Boolean(firstName?.trim()),
    hasLastName: Boolean(lastName?.trim()),
  });
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `${firstName.toLowerCase()}${
    lastName && "." + lastName.toLowerCase()
  }.${random}`;
}
