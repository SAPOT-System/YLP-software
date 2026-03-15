import { Collection, Database, Q } from "@nozbe/watermelondb";
import { GuestUser } from "../database";

export class GuestUserRepository {
  private db: Database;
  private guestUserCollection: Collection<GuestUser>;

  constructor(db: Database) {
    this.db = db;
    this.guestUserCollection = this.db.get<GuestUser>(GuestUser.table);
  }

  async saveGuestUser(newGuestUser: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  }) {
    try {
      return await this.db.write(async () => {
        const guestUser = await this.guestUserCollection.create(
          (guestUser: GuestUser) => {
            guestUser.username = newGuestUser.username;
            guestUser.firstName = newGuestUser.firstName;
            guestUser.lastName = newGuestUser.lastName;
            guestUser._raw.id = newGuestUser.id;
          }
        );
        return guestUser;
      });
    } catch (error) {
      console.error(
        `[GuestUserRepository]: Error creating a guest user\n${JSON.stringify(
          newGuestUser,
          null,
          2
        )}`,
        error
      );
      throw error;
    }
  }

  async isGuestUserExist(id: string) {
    try {
      const existing = await this.guestUserCollection
        .query(Q.where("id", id))
        .fetch();
      return existing.length > 0;
    } catch (error) {
      console.error(
        `[GuestUserRepository]: Error checking if guest user exist\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async getCurrentGuestUser() {
    try {
      const users = await this.guestUserCollection.query().fetch();
      return users[0] || null;
    } catch (error) {
      console.error(
        "[GuestUserRepository]: Error retrieving current guest user:",
        error
      );
      throw error;
    }
  }

  async deleteAllGuestUser() {
    try {
      await this.db.write(async () => {
        const records = await this.guestUserCollection.query().fetch();

        const ops = records.map((r) => r.prepareDestroyPermanently());

        await this.db.batch(...ops);
      });
    } catch (error) {
      console.error(
        "[GuestUserRepository]: Error deleting guest users:",
        error
      );
      throw error;
    }
  }

  async getGuestUserDestroyOps() {
    const records = await this.guestUserCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
