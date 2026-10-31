import { rootFile } from "./project.js";

// The neo-website toolbar, with five profiles: the combinations of screen
// size and input that real users have. None of the dimensions has a default.
export const profiles = {
  phone: { breakpoint: "base", pointer: "touch", keyboard: "no-keyboard" },
  "tablet-portrait": { breakpoint: "sm", pointer: "touch", keyboard: "no-keyboard" },
  "tablet-landscape": { breakpoint: "lg", pointer: "touch", keyboard: "no-keyboard" },
  laptop: { breakpoint: "lg", pointer: "mouse", keyboard: "keyboard" },
  desktop: { breakpoint: "xl", pointer: "mouse", keyboard: "keyboard" },
};

export const toolbarFiles = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
    checks: { visual: {} },
    types: {
      link: { stateGroups: ["hover", "focus"], checks: ["visual"] },
      menu: { states: ["closed", "open"], shared: true },
    },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "wordmark", title: "Wordmark", type: "link" },
        {
          id: "toolbar-links",
          title: "Links",
          children: [{ id: "blog-link", title: "Blog link", type: "link" }],
        },
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          children: [
            { id: "menu-button", title: "Menu button", type: "link" },
            {
              id: "menu-panel",
              title: "Menu panel",
              onlyWhen: { menu: ["open"] },
              children: [{ id: "menu-link", title: "Menu link", type: "link" }],
            },
          ],
        },
      ],
    },
  },
  "roots/page.json": rootFile({ id: "page", title: "Page", children: [{ include: "toolbar" }] }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["toolbar"] },
  "dimensions/keyboard.json": {
    version: 1,
    values: ["keyboard", "no-keyboard"],
    appliesTo: ["toolbar"],
  },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
  "overrides/keyboard.json": {
    version: 1,
    overrides: { "no-keyboard": { types: { link: { states: { remove: ["focused"] } } } } },
  },
  "profiles.json": { version: 1, profiles },
};
