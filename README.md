# JetVibe

**JetVibe** is a VS Code **extension pack** + **configuration preset** that gives your editor a **JetBrains-like** experience: **Darcula** theme, JetBrains fonts, smart keymap, polished UI, and a **curated set of extensions** for a modern full-stack workflow (Laravel/PHP, React, Vue, Angular, DevOps/K8s, etc.)—with a focus on **syntax highlighting + lightweight IntelliSense**.

## ✨ Highlights

- 🎨 **Darcula Theme** (JetVibe)  
- 🔤 **JetBrains Mono & Nerd Font** (with installer commands)  
- 🗂️ **Material Icon Theme**  
- ⚡ **JetBrains-style keymap** (navigation/editing boosts)  
- 🖥️ **UI tweaks** (custom title bar, zoom, tabs, ligatures, minimap off, etc.)  
- 🐚 **Powerlevel10k on WSL** (auto setup for Windows)  
- 🧠 **Lightweight philosophy**: grammars + essential LS only → fast, clean editor

## 🧩 Curated Extension Pack

**Web / Front-end**
- **React / Next** (built-in JS/TS + JSX/TSX), **Tailwind CSS IntelliSense**, **CSS-in-JS** (*styled-components*), **CSS Modules**
- **Vue 3** (**Volar**)
- **Angular** (**Angular Language Service**) – auto-activates only in Angular workspaces
- **Svelte**, **Astro** (syntax + lean IntelliSense)
- **PostCSS**

**Back-end / Templates**
- **PHP** (**Intelephense**) + **Blade**
- **EJS**, **Jinja**, **Twig**

**APIs / Data**
- **GraphQL** (syntax + tooling)
- **Prisma** (schema)
- **OpenAPI/Swagger**
- **Protocol Buffers (.proto)**

**Databases / Utilities**
- **Database Client** (MySQL/PostgreSQL/SQLite/…)
- **DotENV** (.env files)

**Infra / DevOps**
- **Docker**
- **YAML** (incl. K8s ecosystem)
- **Kubernetes Tools**
- **Helm Intellisense**
- **Terraform (HCL)**
- **NGINX**
- **TOML**, **INI**
- **CSV/TSV** (preview/highlight)

**Extra Languages**
- **Python** (+ Pylance), **Go**, **Rust**
- **Markdown + Mermaid**, **PlantUML**
- **Nix** (IDE)

> The full list (with IDs) lives under `extensionPack` in `package.json`.

## 🛠️ JetVibe Commands

**Fonts & Terminal**
- `JetVibe: Install JetBrains Mono`
- `JetVibe: Install JetBrainsMono Nerd Font`
- `JetVibe: Use Nerd Font in Terminal`
- `JetVibe: Setup Powerlevel10k on WSL` *(Windows)*

**Local History (built-in)**
- `JetVibe: Open Local History` *(sidebar: “JetVibe · Local History”)*
- `JetVibe: Show Local History Stats`
- `JetVibe: Cleanup Local History`
- `JetVibe: Diff With Latest Snapshot`
- `JetVibe: Diff Snapshot With Previous`
- `JetVibe: Diff Folder With Local Directory`
- `JetVibe: Switch To Diff With Next Revision`

**PHP (opt-in)**
- `JetVibe: Enable PHP Stubs Extras` → merges common stubs (WordPress, Blackfire, Redis, Imagick, Swoole) **on demand**, keeping defaults lean.

> **Performance**: commands use **`activationEvents: onCommand`**, so JetVibe only activates when you actually use it.

## ⌨️ Keybindings (JetBrains-like)

- **Ctrl+Shift+A** → Command Palette  
- **Ctrl+Alt+L** → Format Document  
- **Alt+Enter** → Quick Fix  
- **Shift+F6** → Rename Symbol  
- **Ctrl+B** → Go to Definition  
- …and more (see `package.json` → `contributes.keybindings`).

## ⚙️ Default Settings

- **Format on Save** enabled  
- **JetVibe Darcula** theme  
- **JetBrains Mono** (+ ligatures)  
- **Minimap off** | **Bracket pair colorization off**  
- **Status bar on**  
- **Terminal** pre-set to **Nerd Font**  
- **PHP**: built-in validation off (use Intelephense)  
- **TypeScript**: use **workspace TS** (`node_modules/typescript/lib`)  
- **Tailwind**: suggestions in common template langs (Blade, Vue, etc.)  
- **Quick suggestions in strings** enabled  
- **Markdown + Mermaid** enabled (diagrams in MD)

## 📦 Installation

1. Install from the **Visual Studio Marketplace**.  
2. **Reload** VS Code.  
3. (Optional) Run font/terminal/WSL commands.  
4. (Optional) For PHP projects that need extra stubs, run  
   **`JetVibe: Enable PHP Stubs Extras`**.

## 🧭 Tips

- **Vue**: use **Volar** (don’t mix with Vetur).  
- **Angular**: LS kicks in only when `angular.json` / `angularCompilerOptions` are present.  
- **PHP**: keep `intelephense.stubs` **unset** by default; enable extras via command when needed (faster, safer across updates).  
- **TS/React/Next**: the project’s TypeScript version rules—fewer mismatches between build and editor.

## 🗺️ Roadmap

- Theme variants (light, high-contrast)  
- Optional stack presets (Laravel-only, React-only, DevOps-only)  
- Community-driven keybinding refinements

## 🤝 Contributing

PRs and issues are welcome!  
Open a ticket if you want another language/grammar added to the pack.

## 📜 License

MIT License.
