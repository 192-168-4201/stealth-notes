# AI Rules & Context for sleek-notes-app

## Project Snapshot
- **App Name:** sleek-notes-app
- **Core Goal:** To create a fast, simple, and slick notes app that feels lightweight and responsive. The main user experience revolves around proximity-based UI, where elements like the sidebar appear smoothly with simple animations when the user's cursor approaches, ensuring the focus remains on the content.
- **Key Files:**
  - `main.js`: Handles the main Electron process, creating the transparent window, and running the smooth window grow/shrink animations.
  - `preload.js`: Safely exposes specific functions from the main process to the renderer, like `smoothGrowRight` and window controls.
  - `renderer.js`: Manages all the user interface logic, including detecting the mouse at the edge of the window, showing/hiding the sidebar, and handling the notes model.
  - `index.html`: Lays out the structure of the app, including the sidebar, editor, and window control buttons.
  - `styles.css`: Defines the entire visual appearance, including the frosted glass effect and sidebar layout.

## House Style & Design Philosophy
- **Sleek & Minimal:** Prioritize a clean, uncluttered interface inspired by modern Apple design aesthetics. The "glassy" look is a key part of this.
- **Effects Elevate Function:** Standard features (sidebars, buttons, backgrounds) should be enhanced with subtle, performant effects rather than just appearing statically.
- **Proximity-Based UI:** Where possible, UI elements like window controls should only appear when needed (e.g., on cursor hover) and should fade in and out smoothly.
- **Performance First:** All animations and effects must be fast, smooth, and responsive, contributing to a lightweight feel.

## Core Mechanic & Guardrail
- The primary unique feature is the sidebar reveal. It **MUST** be implemented by physically growing and shrinking the main `BrowserWindow` to the right using the `smoothGrowRight` and `smoothShrinkRight` IPC calls available in `main.js`.
- **Do NOT** replace this mechanic with an in-window overlay or a simple CSS `transform`. The core effect of the application's footprint changing is essential.

## Key Constants & Behavior
These values in `renderer.js` control the core sidebar animation and can be tweaked to change the app's feel.
- **Sidebar Width (`REQUEST_W`):** `280px`
- **Animation Speed (`ANIM_MS`):** `260ms`
- **Trigger Distance (`TRIGGER`):** `18px`
- **Close Distance (`CLOSE_M`):** `40px`

> **Future Goal:** The sidebar width should eventually become dynamic (based on a ratio of the window size), and the animation speed should be a user-customizable setting.