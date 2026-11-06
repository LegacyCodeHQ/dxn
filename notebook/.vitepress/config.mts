import { defineConfig } from "vitepress";

// The dxn design notebook. Math is written as LaTeX between $ signs and
// rendered when the site is built; Lean and TypeScript are included from their
// source files, so the notebook shows the code as it is.
export default defineConfig({
  title: "dxn Design Notebook",
  description: "The theory, decisions and specification behind the dxn language.",
  cleanUrls: true,
  markdown: { math: true },
  themeConfig: {
    sidebar: [
      { text: "Start here", link: "/" },
      {
        text: "Concepts",
        items: [{ text: "Finite sets", link: "/concepts/finite-sets" }],
      },
    ],
    outline: { level: [2, 3] },
  },
});
