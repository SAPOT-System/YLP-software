import type { HelpArticle } from "../../types";

export const announcements: HelpArticle = {
  title: "Announcements",
  summary: "Read official updates from the SAPOT server.",
  icon: "bullhorn",
  category: "communicating",
  audience: { modes: ["server", "auto"] },
  blocks: [
    { type: "paragraph", text: "Announcements are official updates published by the SAPOT team or incident responders." },
    { type: "bullets", items: ["Use the filters to focus on high-priority updates.", "Announcements need access to the SAPOT server."] },
    { type: "action", label: "Open Announcements", route: { pathname: "/(drawer)/announcements" } },
  ],
};
