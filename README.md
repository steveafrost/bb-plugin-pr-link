# PR Link

A plugin for [bb](https://getbb.app) 0.50 and later. When a pull request is mentioned in chat, a PR action appears in the thread header and opens it where it lives:

- **Delta** for shop/world (PR 2,000,000 and up) and any PR mentioned by a `delta.shopify.io` URL: `https://delta.shopify.io/<owner>/<repo>/pull/<n>`. Delta's PR router then sends you to whichever review site you prefer.
- **GitHub** for everything else: `https://github.com/<owner>/<repo>/pull/<n>`.

One PR opens directly. For several, **PRs (n)** opens a menu below the header, most recently mentioned first. In compact layouts and narrow split panes, bb moves the action into **Thread actions**. On phones and when the header can't anchor the menu, it opens centered instead.

It matches BYOR, GitHub and Delta PR URLs and `owner/repo#123`, in user and agent messages. Issues, file links, tool output and placeholders such as `owner/repo#123` are ignored. It reads the last 100 turns of the timeline and refreshes when a turn starts or ends.

## Develop

```sh
npm install --registry=https://registry.npmjs.org --include=dev
npm test
npm run typecheck
bb plugin types --check
bb plugin build
bb plugin install . --yes
```
