# AmethystDraft

A monorepo powered by Turborepo, combining a real-time API server with a modern React frontend.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `api`: an [Express](https://expressjs.com/) server with [Socket.io](https://socket.io/) for real-time communication
- `web`: a [React](https://react.dev/) app built with [Vite](https://vitejs.dev/)
- `@repo/ui`: a shared React component library
- `@repo/eslint-config`: shared ESLint configurations
- `@repo/typescript-config`: shared `tsconfig.json` files used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

## Getting Started

Install dependencies:

```bash
pnpm install
```

## Branch Naming Convention

This project uses a structured branch naming convention to maintain clarity and enable integration with project management tools:

**Format**: `<type>/<ticket-id>-<description>`

**Branch Types**:

- `feat/` - New features
- `fix/` - Bug fixes
- `test/` - Testing and experimentation
- `chore/` - Maintenance tasks, dependencies, tooling
- `docs/` - Documentation updates
- `refactor/` - Code refactoring without functional changes

**Examples**:

```
feat/KAN-123-add-user-authentication
fix/KAN-456-resolve-socket-disconnect
test/KAN-16-test-jira-integration
chore/KAN-789-update-dependencies
docs/KAN-101-api-documentation
```

## Development

To develop all apps and packages:

```bash
pnpm dev
```

To develop a specific package:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

### Build

To build all apps and packages:

```bash
pnpm build
```

To build a specific package:

```bash
pnpm --filter api build
pnpm --filter web build
```

### Linting and Type Checking

Run linting across all packages:

```bash
pnpm lint
```

Run type checking across all packages:

```bash
pnpm check-types
```

### Formatting

Format code with Prettier:

```bash
pnpm format
```
