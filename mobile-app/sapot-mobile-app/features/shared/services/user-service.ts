import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import uuid from "react-native-uuid";
import { GuestUser, Peer } from "../database";
import { GuestUserRepository } from "../repositories";
import { SessionStore, UserStore } from "../stores";
import { CleanUpService } from "./clean-up-service";
import { PeerService } from "./peer-service";

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
  private readonly logPrefix = "[UserService]";

  constructor(
    private userStore: UserStore,
    private peerService: PeerService,
    private sessionStore: SessionStore,
    private guestUserRepository: GuestUserRepository
  ) {}

  private log(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      console.log(`${this.logPrefix}: ${message}`, meta);
      return;
    }

    console.log(`${this.logPrefix}: ${message}`);
  }

  private warn(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      console.warn(`${this.logPrefix}: ${message}`, meta);
      return;
    }

    console.warn(`${this.logPrefix}: ${message}`);
  }

  private error(message: string, error: unknown) {
    console.error(`${this.logPrefix}: ${message}`, error);
  }

  /**
   * Initializes the user for the current session. Ensures a user UUID exists, creates or fetches the user in the database,
   * and stores the user in the user store.
   * @returns Promise<void>
   */
  async initialize({ isGuest }: { isGuest: boolean }) {
    try {
      this.log("Initializing user", { isGuest });
      let id = await getItemAsync("userUUID");
      if (!id) {
        // TODO: Handle empty userUUID
        this.warn("User UUID is missing");
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
      this.log("User initialization completed", {
        isGuest,
        hasUser: Boolean(user),
      });
    } catch (error) {
      this.error("Error initializing user", error);
      throw error;
    }
  }

  async logout() {
    try {
      this.log("Logout started");
      await deleteItemAsync("userUUID");
      this.sessionStore.setUserId(undefined);
      this.log("Logout completed");
      // TODO: handle if clean up service is undefined
      if (this.cleanUpService) {
        this.cleanUpService.cleanUp();
        this.log("Cleanup completed");
      } else {
        this.warn("Cleanup skipped because service is not set");
      }
    } catch (error) {
      this.error("Error during logout", error);
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
      this.error("Error generating username", error);
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
      this.log("Sync authenticated user started");
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
        this.log("Authenticated user created");
      } else {
        this.log("Authenticated user already exists");
      }
      await this.initialize({ isGuest: false });
      this.log("Sync authenticated user completed");
    } catch (error) {
      this.error("Error syncing authenticated user", error);
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
      this.log("Sync guest user started");
      await setItemAsync("userUUID", generatedUuid);
      const userExist = await this.guestUserRepository.getCurrentGuestUser();
      if (!userExist) {
        await this.guestUserRepository.saveGuestUser({
          ...userInfo,
          id: generatedUuid,
        });
        this.log("Guest user saved");
      } else {
        this.log("Guest user already exists, skipping save");
      }
      await this.initialize({ isGuest: true });
      this.log("Sync guest user completed");
    } catch (error) {
      this.error("Error syncing guest user", error);
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
  }

  async isCurrentUserGuest() {
    try {
      return (await this.guestUserRepository.getCurrentGuestUser()) !== null;
    } catch (error) {
      this.error("Error checking guest user status", error);
      throw error;
    }
  }

  setCleanUpService(cleanUpService: CleanUpService) {
    this.cleanUpService = cleanUpService;
  }

  getUser() {
    return this.userStore.user;
  }
}
