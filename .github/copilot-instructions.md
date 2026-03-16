# Frontend Development Instructions

These instructions must always be followed when generating frontend code for this project.

## Stack

- Framework: Next.js
- Language: TypeScript
- Architecture: Modular and component-based

## Components Structure

- All reusable components must be created inside the `/components` directory.
- Components must be organized by the page where they are used.

Example structure:

/components
/dashboard
DashboardHeader.tsx
DashboardStats.tsx

/components
/users
UserTable.tsx
UserForm.tsx

Rules:

- Each page must have its own folder inside `/components`.
- Components must be small, reusable, and focused on a single responsibility.

## Backend Integration

### Server Actions

- All integrations with the backend must be implemented using **Next.js Server Actions**.
- Business logic and API communication must not be implemented directly inside React components.

### API Pattern

- All backend requests must follow the existing pattern located in:

/src/api

Rules:

- Always reuse the existing request structure.
- Do not create new request patterns outside `/src/api`.
- API communication must be centralized in this folder.

## Translations

- All responses returned from the backend must be automatically translated before being displayed in the UI.
- No raw backend message should be shown directly to the user.
- Always pass responses through the project's translation mechanism before rendering.

Example rule:
Backend response → translation layer → UI display.

## Code Quality

Always follow these rules when generating code:

- Use TypeScript with strict typing.
- Avoid using `any`.
- Prefer functional components.
- Keep components small and maintainable.
- Separate UI, logic, and API access.

## General Principles

- Follow clean and scalable architecture.
- Prefer composition over large components.
- Keep UI components focused on rendering only.
- Keep business logic inside server actions or API layer.

Always respect these rules when generating frontend code.
