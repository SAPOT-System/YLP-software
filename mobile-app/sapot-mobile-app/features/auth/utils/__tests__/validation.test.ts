import { validateGuestLoginForm } from "../validation";

describe("validateGuestLoginForm", () => {
  describe("firstName validation", () => {
    it("requires first name", () => {
      expect(validateGuestLoginForm("", "")).toMatchObject({
        firstName: "First name is required",
      });
    });

    it("requires at least 2 characters", () => {
      expect(validateGuestLoginForm("A", "")).toMatchObject({
        firstName: "First name must be at least 2 characters",
      });
    });

    it("rejects non-letter characters", () => {
      expect(validateGuestLoginForm("J0hn", "")).toMatchObject({
        firstName: "First name must contain only letters",
      });
    });

    it("accepts valid first name", () => {
      expect(validateGuestLoginForm("Juan", "").firstName).toBeUndefined();
    });
  });

  describe("lastName validation — optional", () => {
    it("accepts empty last name with no error", () => {
      expect(validateGuestLoginForm("Juan", "").lastName).toBeUndefined();
    });

    it("accepts whitespace-only last name with no error", () => {
      expect(validateGuestLoginForm("Juan", "   ").lastName).toBeUndefined();
    });

    it("rejects last name shorter than 2 chars when provided", () => {
      expect(validateGuestLoginForm("Juan", "D")).toMatchObject({
        lastName: "Last name must be at least 2 characters",
      });
    });

    it("rejects last name with invalid characters when provided", () => {
      expect(validateGuestLoginForm("Juan", "D3la")).toMatchObject({
        lastName: "Last name must contain only letters",
      });
    });

    it("rejects last name over 50 chars when provided", () => {
      expect(validateGuestLoginForm("Juan", "A".repeat(51))).toMatchObject({
        lastName: expect.stringContaining("50"),
      });
    });

    it("accepts valid last name when provided", () => {
      expect(validateGuestLoginForm("Juan", "Dela Cruz").lastName).toBeUndefined();
    });
  });
});
