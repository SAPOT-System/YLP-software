import { HELP_ARTICLES, HELP_ARTICLE_IDS, getArticle } from "../registry";

describe("help article registry", () => {
  it("exposes its article ids", () => expect(HELP_ARTICLE_IDS).toHaveLength(Object.keys(HELP_ARTICLES).length));
  it("returns known articles and safely ignores unknown ids", () => {
    expect(getArticle("calls")?.title).toBe("Calls");
    expect(getArticle("not-real")).toBeUndefined();
  });
});
