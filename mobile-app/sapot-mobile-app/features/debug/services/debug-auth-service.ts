import {
  loginAsFixtureApi,
  register as registerApi,
} from "@/features/auth/api/auth.api";
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

/**
 * Handles the server's `/testing/seed/roles` scenario is known to create
 * (see `server/app/db_operations/qa_scenarios.py`).
 *
 * All but `qa_guest` are minted through `/testing/login-as/{handle}`; see
 * `GUEST_FIXTURE_HANDLE` for why that one is local-only.
 */
export const FIXTURE_HANDLES = [
  "qa_baseline",
  "qa_baseline_b",
  "qa_rescuer",
  "qa_admin",
  "qa_guest",
] as const;

export type FixtureHandle = (typeof FIXTURE_HANDLES)[number];

/**
 * The one fixture button that never talks to the server. A guest in this app is
 * a local-only identity — a `guest_user` row with a locally-generated UUID and
 * no JWT (`UserService.syncGuestUser`) — so authenticating as one is a
 * contradiction: `/testing/login-as/qa_guest` would mint a token pair only for
 * it to be thrown away, and would fail with a 404 whenever the fixture happens
 * to be unseeded. Going straight to the guest path keeps the button honest and
 * unbreakable.
 */
const GUEST_FIXTURE_HANDLE = "qa_guest";

/**
 * Fixed identity for the `qa_guest` button, mirroring the server fixture's
 * `first_name`/`last_name` (`get_or_create_user` defaults to "QA"/"Fixture").
 * Deliberately *not* run through `generateGuestUsername` — testers land on the
 * same guest every time, which is the whole point of a fixture and the one
 * thing that distinguishes this from the randomized "Seed LAN user" button.
 */
const GUEST_FIXTURE_IDENTITY = {
  firstName: "QA",
  lastName: "Fixture",
  username: "qa.fixture",
} as const;

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
   * Logs in as a seeded server fixture account (`/testing/seed/roles`) instead of
   * registering a new one, so testers land on the same known identity every time
   * rather than a fresh `debug_<role>_<suffix>` account (GH #274). Same
   * token-storage/sync path as `seedTestUser`, minus registration.
   *
   * `qa_guest` is the exception and never reaches the server — see
   * `GUEST_FIXTURE_HANDLE`.
   */
  async loginAs(handle: FixtureHandle): Promise<void> {
    if (handle === GUEST_FIXTURE_HANDLE) {
      await this.becomeGuest(GUEST_FIXTURE_IDENTITY);
      return;
    }

    await this.userService.wipeDatabase();

    const { data } = await loginAsFixtureApi(handle);

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

    if (handle === "qa_rescuer") this.setRole("rescuer");
    else if (handle === "qa_admin") this.setRole("admin");
    else this.setRole("user");
  }

  /**
   * Seeds a guest/LAN-only user (same identity path as the real "LAN Login"
   * guest flow) — no server account, no JWT, always `isGuest`. Useful for
   * exercising LAN-only messaging/transport without an authenticated user.
   */
  async seedLanUser(): Promise<void> {
    const firstName =
      LAN_USER_FIRST_NAMES[
        Math.floor(Math.random() * LAN_USER_FIRST_NAMES.length)
      ];
    const lastName = "Lan";
    await this.becomeGuest({
      firstName,
      lastName,
      username: generateGuestUsername(firstName, lastName),
    });
  }

  /**
   * Shared tail of every "end up as a guest" path (`seedLanUser`, and the
   * `qa_guest` fixture button). Role flags are left alone deliberately —
   * `UserService.initialize({ isGuest: true })` already forces rescuer/admin
   * false, so setting them here would be redundant.
   */
  private async becomeGuest(identity: {
    firstName: string;
    lastName: string;
    username: string;
  }): Promise<void> {
    await this.userService.wipeDatabase();
    // Guests never hold a session — drop any leftover access/refresh token
    // from a previously seeded/registered auth user.
    await deleteItemAsync("refresh_token");
    await clearStoredAccessToken();

    await this.userService.syncGuestUser(identity);
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
