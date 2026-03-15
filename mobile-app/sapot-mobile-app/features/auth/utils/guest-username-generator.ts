export function generateGuestUsername(
  firstName: string,
  lastName: string
): string {
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `${firstName.toLowerCase()}${
    lastName && "." + lastName.toLowerCase()
  }.${random}`;
}
