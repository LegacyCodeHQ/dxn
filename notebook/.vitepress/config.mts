import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { leanSnippets } from "./lean-snippets.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

// The dxn design notebook. Math is written as LaTeX between $ signs and
// rendered when the site is built; Lean is included from marked regions of its
// source files, so the notebook shows the code as it is.
export default defineConfig({
  title: "dxn Design Notebook",
  description: "The theory, decisions and specification behind the dxn language.",
  // Local development stays at /; the Pages build supplies /dxn/.
  base: process.env.NOTEBOOK_BASE ?? "/",
  cleanUrls: true,
  ignoreDeadLinks: false,
  markdown: { math: true, config: (md) => leanSnippets(md, root) },
  themeConfig: {
    sidebar: [
      { text: "Start here", link: "/" },
      {
        text: "Concepts",
        items: [
          { text: "Finite sets", link: "/concepts/finite-sets" },
          { text: "Disjoint unions", link: "/concepts/disjoint-unions" },
          { text: "Bijections", link: "/concepts/bijections" },
          { text: "Cartesian products", link: "/concepts/cartesian-products" },
        ],
      },
      {
        text: "Language reference",
        items: [
          { text: "Files", link: "/reference/files" },
          { text: "Enumerations", link: "/reference/enumerations" },
        ],
      },
      {
        text: "Refactoring",
        items: [
          { text: "Overview", link: "/refactoring/" },
          { text: "Renaming an enumeration", link: "/refactoring/rename-enumeration" },
        ],
      },
    ],
    outline: { level: [2, 3] },
  },
});
