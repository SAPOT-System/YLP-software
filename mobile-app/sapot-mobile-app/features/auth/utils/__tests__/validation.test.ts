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

  describe("lastName validation — required", () => {
    it("requires last name", () => {
      expect(validateGuestLoginForm("Juan", "")).toMatchObject({
        lastName: "Last name is required",
      });
    });

    it("requires last name when whitespace only", () => {
      expect(validateGuestLoginForm("Juan", "   ")).toMatchObject({
        lastName: "Last name is required",
      });
    });

    it("rejects last name shorter than 2 chars", () => {
      expect(validateGuestLoginForm("Juan", "D")).toMatchObject({
        lastName: "Last name must be at least 2 characters",
      });
    });

    it("rejects last name with invalid characters", () => {
      expect(validateGuestLoginForm("Juan", "D3la")).toMatchObject({
        lastName: "Last name must contain only letters",
      });
    });

    it("rejects last name over 50 chars", () => {
      expect(validateGuestLoginForm("Juan", "A".repeat(51))).toMatchObject({
        lastName: expect.stringContaining("50"),
      });
    });

    it("accepts valid last name", () => {
      expect(validateGuestLoginForm("Juan", "Dela Cruz").lastName).toBeUndefined();
    });
  });
});
