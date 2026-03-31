import { jwtDecode } from "jwt-decode";

export const isAccessTokenValid = async (token: string) => {
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 > Date.now();
  } catch {
    return false;
  }
};
