import { isRescuerApi } from "@/features/shared/api/user-profile.api";
import { authLog } from "@/features/shared/utils/logger";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import uuid from "react-native-uuid";
import { GuestUser, Peer } from "../database";
import { GuestUserRepository } from "../repositories";
import { SessionStore, UserStore } from "../stores";
import { CleanUpService } from "./clean-up-service";
import { PeerService } from "./peer-service";

authLog.debug("[user-service] module loaded");

/**
 * UserService manages user initialization, user identity, and user persistence in the app.
 * It ensures a user exists in the database and is available in the session and user stores.
 */
export class UserService {
  /**
   * Constructs a UserService instance.
   * @param userStore Store for the current user
   * @param peerService Service for peer management
   * @param sessionStore Store for session state
   */

  private cleanUpService?: CleanUpService;

  constructor(
    private userStore: UserStore,
    private peerService: PeerService,
    private sessionStore: SessionStore,
    private guestUserRepository: GuestUserRepository
  ) {
    this.log("service constructed", {
      hasUserStore: Boolean(userStore),
      hasPeerService: Boolean(peerService),
      hasSessionStore: Boolean(sessionStore),
      hasGuestUserRepository: Boolean(guestUserRepository),
    });
  }

  private log(message: string, meta?: Record<string, unknown>) {
    authLog.info(`user › ${message}`, meta);
  }

  private warn(message: string, meta?: Record<string, unknown>) {
    authLog.warn(`user › ${message}`, meta);
  }

  private error(message: string, error: unknown) {
    authLog.error(`user › ${message}`, { error });
  }

  /**
   * Initializes the user for the current session. Ensures a user UUID exists, creates or fetches the user in the database,
   * and stores the user in the user store.
   * @returns Promise<void>
   */
  async initialize({ isGuest }: { isGuest: boolean }) {
    try {
      this.log("initialize start", { isGuest });
      let id = await getItemAsync("userUUID");
      if (!id) {
        // TODO: Handle empty userUUID
        this.warn("missing user id");
        return;
      }

      this.sessionStore.setUserId(id);

      let user: Peer | GuestUser;
      if (isGuest) {
        user = await this.guestUserRepository.getCurrentGuestUser();
      } else {
        // find the current user in the peers table
        user = await this.peerService.findPeerById(id);
      }

      // store the user's peer object
      this.userStore.setUser(user, isGuest);

      if (!isGuest) {
        const rescuer = await isRescuerApi();
        this.userStore.setIsRescuer(rescuer);
      } else {
        this.userStore.setIsRescuer(false);
      }

      this.log("initialize complete", {
        isGuest,
        hasUser: Boolean(user),
        isRescuer: this.userStore.isRescuer,
      });
    } catch (error) {
      this.error("initialize failed", error);
      throw error;
    }
  }

  getIsRescuer(): boolean {
    return this.userStore.isRescuer;
  }

  async logout() {
    try {
      this.log("logout start");
      this.userStore.setIsRescuer(false);
      await deleteItemAsync("userUUID");
      this.sessionStore.setUserId(undefined);
      this.log("logout complete");
      // TODO: handle if clean up service is undefined
      if (this.cleanUpService) {
        this.cleanUpService.cleanUp();
        this.log("cleanup complete");
      } else {
        this.warn("cleanup skipped", { reason: "service not set" });
      }
    } catch (error) {
      this.error("logout failed", error);
      throw error;
    }
  }

  /**
   * Generates a random username for the user. Will be replaced by authentication in the future.
   * @returns string The generated username
   */
  private generateUsername(): string {
    try {
      return `User_${Math.random().toString(36).substring(7)}`;
    } catch (error) {
      this.error("generate username failed", error);
      throw error;
    }
  }

  async syncAuthenticatedUser(userInfo: {
    id: string;
    username: string;
    first_name: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    email_verified?: boolean;
  }) {
    try {
      this.log("sync auth start");
      await setItemAsync("userUUID", userInfo.id);
      const userExist = await this.peerService.findPeerById(userInfo.id);
      if (!userExist) {
        await this.peerService.createUser(
          userInfo.id,
          userInfo.username,
          userInfo.first_name,
          userInfo.last_name,
          userInfo.email,
          userInfo.phone_number,
          userInfo.email_verified
        );
        this.log("sync auth user created");
      } else {
        this.log("sync auth user exists");
      }
      await this.initialize({ isGuest: false });
      this.log("sync auth complete");
    } catch (error) {
      this.error("sync auth failed", error);
      throw error;
    }
  }

  async syncGuestUser(userInfo: {
    firstName: string;
    username: string;
    lastName: string;
  }) {
    try {
      const generatedUuid = uuid.v4();
      this.log("sync guest start");
      await setItemAsync("userUUID", generatedUuid);
      const userExist = await this.guestUserRepository.getCurrentGuestUser();
      if (!userExist) {
        await this.guestUserRepository.saveGuestUser({
          ...userInfo,
          id: generatedUuid,
        });
        this.log("sync guest saved");
      } else {
        this.log("sync guest exists");
      }
      await this.initialize({ isGuest: true });
      this.log("sync guest complete");
    } catch (error) {
      this.error("sync guest failed", error);
      throw error;
    }
  }

  async updateAuthenticatedUser(userInfo: {
    username?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    emailVerified?: boolean;
  }) {
    this.log("update auth start", {
      hasUsername: Boolean(userInfo.username),
      hasFirstName: Boolean(userInfo.firstName),
      hasLastName: Boolean(userInfo.lastName),
      hasEmail: Boolean(userInfo.email),
      hasPhoneNumber: Boolean(userInfo.phoneNumber),
      emailVerified: userInfo.emailVerified,
    });
    const id = await getItemAsync("userUUID");
    if (id === null) return; //TODO: inform user of error

    await this.peerService.updatePeerInfo(id, {
      username: userInfo.username,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      email: userInfo.email,
      phoneNumber: userInfo.phoneNumber,
      emailVerified: userInfo.emailVerified,
    });

    const user = await this.peerService.findPeerById(id);

    this.userStore.setUser(user, false);
    this.log("update auth complete", { hasUser: Boolean(user) });
  }

  async isCurrentUserGuest() {
    try {
      return (await this.guestUserRepository.getCurrentGuestUser()) !== null;
    } catch (error) {
      this.error("guest check failed", error);
      throw error;
    }
  }

  setCleanUpService(cleanUpService: CleanUpService) {
    this.log("cleanup service set", {
      hasCleanUpService: Boolean(cleanUpService),
    });
    this.cleanUpService = cleanUpService;
  }

  getUser() {
    return this.userStore.user;
  }
}
