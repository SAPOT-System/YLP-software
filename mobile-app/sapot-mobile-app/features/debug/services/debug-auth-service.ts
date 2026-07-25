import { register as registerApi } from "@/features/auth/api/auth.api";
import { generateGuestUsername } from "@/features/auth/utils/guest-username-generator";
import { UserService } from "@/features/shared/connection/services/user-service";
import {
  clearAccessToken as clearStoredAccessToken,
  clearConnectionConfig,
  getStoredAccessToken,
  saveAccessToken,
} from "@/features/shared/core/stores/secure-config";
import { UserStore } from "@/features/shared/core/stores/user-store";
import { deleteItemAsync, setItemAsync } from "expo-secure-store";
import uuid from "react-native-uuid";

const LAN_USER_FIRST_NAMES = [
  "Alex",
  "Sam",
  "Jordan",
  "Taylor",
  "Casey",
  "Riley",
  "Morgan",
  "Jamie",
];

export type DebugUserRole = "user" | "rescuer" | "admin";

export interface DebugAuthSnapshot {
  userId: string | null;
  username: string | null;
  isGuest: boolean;
  isRescuer: boolean;
  isAdmin: boolean;
  hasAccessToken: boolean;
}

/**
 * DebugAuthService drives the Auth/User debug section: seeding test users,
 * switching roles, and exercising JWT/session/reset flows without real
 * credentials. Only reachable behind `IS_DEBUG_ENABLED`.
 */
export class DebugAuthService {
  constructor(
    private userService: UserService,
    private userStore: UserStore
  ) {}

  /**
   * Registers a real account through the server's `/auth/` endpoint (same
   * `register` API the sign-up screen uses) rather than fabricating a local
   * peer row, so the fixture user has genuine access/refresh tokens and
   * exists on the backend like any other account.
   */
  async seedTestUser(role: DebugUserRole): Promise<void> {
    // Wipe the previous user's data first so seeding never leaves behind
    // stale peers/messages/conversations from whoever was signed in before.
    await this.userService.wipeDatabase();

    const suffix = Math.random().toString(36).slice(2, 8);
    const { data } = await registerApi({
      username: `debug_${role}_${suffix}`,
      first_name: "Debug",
      last_name: role,
      password: `Debug1${suffix}A`,
      terms_accepted: true,
    });

    await saveAccessToken(data.access_token);
    await setItemAsync("refresh_token", data.refresh_token);

    await this.userService.syncAuthenticatedUser({
      id: data.id,
      username: data.username,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone_number: data.phone_number,
    });
    this.setRole(role);
  }

  /**
   * Seeds a guest/LAN-only user (same identity path as the real "LAN Login"
   * guest flow) — no server account, no JWT, always `isGuest`. Useful for
   * exercising LAN-only messaging/transport without an authenticated user.
   */
  async seedLanUser(): Promise<void> {
    await this.userService.wipeDatabase();
    // Guests never hold a session — drop any leftover access/refresh token
    // from a previously seeded/registered auth user.
    await deleteItemAsync("refresh_token");
    await clearStoredAccessToken();

    const firstName =
      LAN_USER_FIRST_NAMES[
        Math.floor(Math.random() * LAN_USER_FIRST_NAMES.length)
      ];
    const lastName = "Lan";
    await this.userService.syncGuestUser({
      firstName,
      lastName,
      username: generateGuestUsername(firstName, lastName),
    });
  }

  setRole(role: DebugUserRole): void {
    this.userStore.setIsRescuer(role === "rescuer");
    this.userStore.setIsAdmin(role === "admin");
  }

  async injectFakeAccessToken(): Promise<void> {
    await saveAccessToken(`debug.${uuid.v4()}.token`);
  }

  async clearAccessToken(): Promise<void> {
    await clearStoredAccessToken();
  }

  /**
   * Mirrors the production logout flow (`AuthContext.logout`): drops
   * `userUUID`/`refresh_token`/`access_token` so the next app restart finds
   * no local session and lands on the login screen, instead of silently
   * re-authenticating via a leftover refresh token.
   */
  async forceLogout(): Promise<void> {
    await this.userService.logout();
    await deleteItemAsync("refresh_token");
    await clearConnectionConfig();
  }

  /**
   * Removes only the access token, leaving `userUUID`/`refresh_token` and
   * local data intact. On the next app restart, `AuthProvider`'s bootstrap
   * finds the local user record, stays signed in, and silently refreshes a
   * new access token via the still-valid refresh token — no login screen.
   */
  async resetAuthState(): Promise<void> {
    await clearStoredAccessToken();
  }

  async getSnapshot(): Promise<DebugAuthSnapshot> {
    const hasAccessToken = Boolean(await getStoredAccessToken());

    let userId: string | null = null;
    let username: string | null = null;
    try {
      const user = this.userStore.user;
      userId = user.id;
      username = user.username;
    } catch {
      // No user initialized yet — leave identity fields null.
    }

    return {
      userId,
      username,
      isGuest: this.userStore.isGuest,
      isRescuer: this.userStore.isRescuer,
      isAdmin: this.userStore.isAdmin,
      hasAccessToken,
    };
  }
}
