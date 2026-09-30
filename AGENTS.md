# Decisions playground

Small standalone Node.js + browser JavaScript app; no runtime dependencies or build step.
Use `npm test` for the full server/contract suite and `npm run test:browser` for browser coverage.
Never launch or stop a user's Mesh process. Bind the web server to loopback only.
Keep the upstream URL server-configured, the proxy route allowlist exact, and Host/Origin checks intact.
No credentials, prompts, or responses in logs or persistent browser storage.
Work in a feature worktree. Do not merge or push main without human approval.
