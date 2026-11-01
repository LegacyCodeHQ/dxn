# Gazette

A small, fictional RSS reader for iPhone, built with dxn: its components first,
as a design system, then its screens from them. It is the example of the whole
flow, from a model to designs to the evidence that ties them together.

## The flow

For each component, then each screen:

1. **Model it** in `gazette.dxn`, written by hand in Zed: its states, the
   dimensions it needs, and expectations about it.
2. **List its cases** with `dxn cases gazette.dxn <Type>`: the combinations
   that look different, each needing a design.
3. **Design each case** as a frame in `gazette.pen`, in pen.dev.
4. **Record each frame** as evidence with `dxn attach`, in `pen-evidence/`.
5. **See what is covered** with `dxn status gazette.dxn`.

dxn says what each component can be; the pen file shows how it looks. How
anything looks (colour, type, spacing) lives in the pen file only.

## The app

Gazette shows the articles of the feeds you follow, newest first. You read an
article, save it for later, and choose which sources to follow. That is all:
no accounts, no sync, no notifications.

### What varies

- **Screen size:** a small iPhone (an SE) and a large one (a Pro Max).
- **Text size:** the default, and larger, from the accessibility settings.
- **Appearance:** light or dark, which the person chooses, not the device.
- **Input:** touch only. There is no hover; a pressed state takes its place.

Each device is a profile; larger text is a modifier any device can have.

## Screens

Four screens, reached from a tab bar at the bottom, but for the article, which
opens from a list.

1. **Feed:** the newest articles from every followed source, each a row with
   its source, headline, time and, when it has one, a thumbnail. Pull to
   refresh. Empty when nothing is followed yet, with a button to the sources.
2. **Article:** one article's text, with its source and time above it, a back
   button, and a button to save it or remove it from saved.
3. **Saved:** the saved articles, in the order they were saved, in the same
   rows as the feed. Empty until something is saved.
4. **Sources:** the sources there are, each with a toggle to follow it or not.

## Components

In the order to build them: each from the ones before it, where it uses any.

1. **Button:** primary, secondary or tertiary; idle, hovered, pressed or disabled.
2. **Toggle:** off or on; idle, hovered, pressed or disabled.
3. **Tab:** one tab of the tab bar, with its icon and label; unselected or
   selected; idle, hovered or pressed.
4. **Tab bar:** the three tabs, Feed, Saved and Sources, one of them selected.
5. **Back button:** idle, hovered or pressed.
6. **Navigation bar:** a screen's title, with a back button on the article.
7. **Article row:** source, headline, time; read or unread; saved or not; with
   or without a thumbnail; pressed or not.
8. **Source row:** a source's name, with a toggle to follow it.

Then the screens, from the components.

## Progress

- [x] Button
- [x] Toggle
- [x] Tab
- [x] Tab bar
- [x] Back button
- [x] Navigation bar
- [ ] Article row
- [ ] Source row
- [ ] Feed
- [ ] Article
- [ ] Saved
- [ ] Sources
