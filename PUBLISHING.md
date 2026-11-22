# Publishing

## 1. Replace the repository URL

Edit `package.json`:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/YOUR_NAME/dsh-cross-agent.git"
},
"bugs": {
  "url": "https://github.com/YOUR_NAME/dsh-cross-agent/issues"
},
"homepage": "https://github.com/YOUR_NAME/dsh-cross-agent#readme"
```

## 2. Verify the package contents

```bash
npm pack --dry-run
```

Expected files:

```text
index.js
client.js
cordis.patch.yml
locale/*.json
docs/
README.md
README.zh.md
LICENSE
SECURITY.md
CHANGELOG.md
icon.svg
package.json
```

## 3. Create the GitHub repo

```bash
git init -b main
git add .
git commit -m "feat: cross-session mailbox for DSH"
git remote add origin https://github.com/YOUR_NAME/dsh-cross-agent.git
git push -u origin main
```

## 4. Publish to npm (optional)

```bash
npm publish --access public
```

`@yiyiaha-yuan/dsh-cross-agent` must be available; if the name is taken, use a scope such as `@YOUR_NAME/@yiyiaha-yuan/dsh-cross-agent` and update:

- `package.json` `name`
- `cordis.patch.yml` `name`
- `client.js` module id
- README install line

## 5. Install from the published package

In DSH **Plugins → Add plugin**, install `@yiyiaha-yuan/dsh-cross-agent` (or your scope), then enable it.

## Checklist

- [ ] No `D:\`, `C:\Users\`, or personal absolute paths
- [ ] No API keys, tokens, passwords, session IDs
- [ ] `private` is absent
- [ ] LICENSE present
- [ ] `npm pack --dry-run` contains no screenshots or local data
- [ ] README matches the actual UI and tool names


