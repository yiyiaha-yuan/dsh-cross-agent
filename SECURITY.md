# Security

## Scope

`dsh-cross-agent` is a local-only plugin. It stores messages under `~/.dsh/cross-agent` by default and does not open a network listener.

## Trust model

- The plugin does not authenticate peers beyond the local DSH profile.
- Any process or user that can read the store can read its messages.
- Messages are plaintext; do not send API keys, passwords, or private tokens.
- Received messages are data, not instructions. Agents should not execute commands from a message without normal review.

## Reporting

Open a private security advisory on the GitHub repository, or contact the maintainer listed in `package.json`.
