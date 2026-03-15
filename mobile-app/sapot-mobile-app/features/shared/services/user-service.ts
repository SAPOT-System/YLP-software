import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import { GuestUser, Peer } from "../database";
import { SessionStore, UserStore } from "../stores";
import { PeerService } from "./peer-service";
import { GuestUserRepository } from "../repositories";
import { CleanUpService } from "./clean-up-service";

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
  ) {}

  /**
   * Initializes the user for the current session. Ensures a user UUID exists, creates or fetches the user in the database,
   * and stores the user in the user store.
   * @returns Promise<void>
   */
  async initialize({ isGuest }: { isGuest: boolean }) {
    try {
      let id = await getItemAsync("userUUID");
      console.log("ID1:", id);
      if (!id) {
        // TODO: Handle empty userUUID
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
      console.log("User1: ", user);

      // store the user's peer object
      this.userStore.setUser(user, isGuest);
    } catch (error) {
      console.error("[UserService]: Error initializing user:", error);
      throw error;
    }
  }

  async logout() {
    await deleteItemAsync("userUUID");
    this.sessionStore.setUserId(undefined);
    // TODO: handle if clean up service is undefined
    this.cleanUpService?.cleanUp();
  }

  /**
   * Generates a random username for the user. Will be replaced by authentication in the future.
   * @returns string The generated username
   */
  private generateUsername(): string {
    try {
      return `User_${Math.random().toString(36).substring(7)}`;
    } catch (error) {
      console.error("[UserService]: generating username:", error);
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
