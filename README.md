# PR Link

A [bb](https://getbb.app) plugin. When a pull request is mentioned in a thread's chat, a PR icon appears in the thread header and opens it where it lives:

- **Delta** for shop/world (PR 2,000,000 and up) and any PR mentioned by a `delta.shopify.io` URL: `https://delta.shopify.io/<owner>/<repo>/pull/<n>`. Delta's PR router then sends you to whichever review site you prefer.
- **GitHub** for everything else: `https://github.com/<owner>/<repo>/pull/<n>`.

- One PR: the icon links straight to it.
- Several PRs: the icon shows a count and opens a menu, most recently mentioned first.

It matches BYOR, GitHub and Delta PR URLs and `owner/repo#123`, in user and agent messages. Issues, file links, tool output and placeholders such as `owner/repo#123` are ignored. It reads the last 100 turns of the timeline and refreshes when a turn starts or ends.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin build
bb plugin install . --yes
```
