# @tscircuit/plop

A simple tool for copying commonly used files from tscircuit projects.

```
npm install -g @tscircuit/plop
```

https://github.com/tscircuit/plop/assets/1910070/52cc1dd6-fd0f-433d-9d59-b5c1b727076e


### Custom dependency update resolution

`template-files/update-package.yml` is the source for the generated dependency
update workflow. Change this template instead of editing a repository's generated
copy, then regenerate that copy when rolling out a template change.

Repositories can opt into compatibility-aware updates by providing
`scripts/update-packages.ts`. The script receives comma-separated `PACKAGE_NAMES`
and may write a PR description to `UPDATE_SUMMARY_PATH`. The workflow runs that
script, then `bun test`, `bunx tsc --noEmit`, and `bun run build` before creating a
PR. This opt-in requires those validation commands to work in the repository.
Repositories without the script keep the existing package update loop and default
PR description.
