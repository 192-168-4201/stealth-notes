# Project Brief: sleek-notes-app

## Core Goal
To create a fast, simple, and slick notes app that feels lightweight and responsive. The main user experience revolves around proximity-based UI, where elements like the sidebar appear smoothly with simple animations when the user's cursor approaches, ensuring the focus remains on the content.

## Core Features
* **Glassmorphism UI:** The application uses a frameless, transparent window with a CSS `backdrop-filter` to create a "glassy" look and feel.
* **Proximity-Triggered Sidebar:** A sidebar containing notes slides out when the user's cursor approaches the right edge of the editor.
* **Window-Grow Mechanic:** The sidebar is revealed by physically growing the application window to the right, creating a seamless effect where the app's footprint expands.
* **In-Memory Notes Model:** The app supports creating new notes, selecting notes to view, and updating them in real-time. The notes are currently stored in memory.
* **Custom Window Controls:** The app features custom-styled minimize and close buttons for a consistent look.

## Tech Stack
* **Framework:** Electron
* **Languages:** Plain HTML, CSS, and JavaScript (no front-end frameworks)