# PR Link

A [bb](https://getbb.app) plugin. When a pull request is mentioned in a thread's chat, a PR icon appears in the thread header and opens that PR on [BYOR](https://byor.quick.shopify.io).

- One PR: the icon links straight to it.
- Several PRs: the icon shows a count and opens a menu, most recently mentioned first.

It matches BYOR, GitHub and Delta PR URLs and `owner/repo#123`, in user and agent messages. Issues, file links and tool output are ignored. It reads the last 100 turns of the timeline and refreshes when a turn starts or ends.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin build
bb plugin install . --yes
```
