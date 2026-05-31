 Bitburner Studio

> Build, learn, and automate.

A modern development environment for Bitburner featuring workspace synchronization, TypeScript support, live compilation, extensible modules, visual scripting, and future AI-assisted learning tools.

---

## Vision

Bitburner Studio aims to make Bitburner feel like a real software development environment while remaining approachable for new programmers.

The project is built around a simple idea:

> Learn programming through creation, not repetition.

Users should be able to start with visual tools, inspect the generated TypeScript, understand how it works, and eventually write their own code.

---

## Current Features

### Workspace Synchronization

- Download files from Bitburner
- Upload local changes automatically
- Keep local and in-game workspaces synchronized

### TypeScript Support

- Automatic TypeScript detection
- Incremental compilation
- Watch mode support
- Generated JavaScript deployment

### Strongly Typed Configuration

```ts
const root = config.get('workspace.root');
const autoWatch = config.get('typescript.auto-watch');
```

Full autocomplete and type safety.

### Live Development Workflow

- File watching
- Incremental builds
- Automatic uploads
- Fast iteration loop

---

## Planned Features

### Module System

```json
{
  "modules": {
    "ui": true,
    "remote": true,
    "source-manager": true
  }
}
```

Modules will be able to:

- Install automatically
- Download sources
- Generate typings
- Configure dependencies
- Integrate into the workspace

### Visual Programming

Node-based scripting for Bitburner.

```text
Scan Network
      ↓
Find Targets
      ↓
Analyze
      ↓
Hack
```

Generated code remains visible and editable.

### AI Assistant

Future AI features may include:

- Code explanation
- Error diagnosis
- Script generation
- Learning assistance
- Contract guidance

The goal is to teach programming, not hide it.

---

## Roadmap

### Core

- [x] Workspace synchronization
- [x] Automatic uploads
- [x] Automatic downloads
- [x] TypeScript support
- [x] Watch mode
- [x] Typed configuration

### Modules

- [ ] Module manager
- [ ] Module registry
- [ ] Dependency management
- [ ] Automatic typings

### UI

- [ ] Vizui integration
- [ ] Dashboard
- [ ] Monitoring tools
- [ ] Contract utilities

### Visual Development

- [ ] Node editor
- [ ] Flow execution
- [ ] Code generation
- [ ] Visual debugging

### AI

- [ ] AI assistant
- [ ] Error explanations
- [ ] Learning mode
- [ ] Context-aware guidance

---

## Philosophy

Bitburner Studio should:

- Encourage learning
- Generate readable code
- Remain transparent
- Stay modular
- Scale from beginner to advanced users

---

## Status

Early development.

Expect rapid changes before the first stable release.

---

## License

Apache-2.0
