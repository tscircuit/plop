const { test } = require("node:test")
const assert = require("node:assert/strict")
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const { spawnSync } = require("node:child_process")

const template = readFileSync(
  join(__dirname, "../template-files/update-package.yml"),
  "utf8",
)
const updateStep = template
  .split("      - name: Update packages\n")[1]
  .split("      - name: Close existing PRs\n")[0]
const script = updateStep
  .split("        run: |\n")[1]
  .split("\n")
  .map((line) => line.slice(10))
  .join("\n")

function runUpdate({ custom = false, fail = "" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "plop-update-"))
  try {
    mkdirSync(join(directory, "bin"))
    const stub =
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$*" = "$FAIL_COMMAND" ]; then exit 1; fi\n'
    for (const name of ["bun", "bunx"]) {
      writeFileSync(join(directory, "bin", name), stub, { mode: 0o755 })
    }
    if (custom) {
      mkdirSync(join(directory, "scripts"))
      writeFileSync(
        join(directory, "scripts/update-packages.ts"),
        "// custom updater",
      )
    }
    const summary = join(directory, "summary.md")
    const log = join(directory, "commands.log")
    const result = spawnSync("bash", ["-e", "-c", script], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${join(directory, "bin")}:${process.env.PATH}`,
        PACKAGE_NAMES: "@tscircuit/3d-viewer,@tscircuit/core",
        UPDATE_SUMMARY_PATH: summary,
        COMMAND_LOG: log,
        FAIL_COMMAND: fail,
      },
      encoding: "utf8",
    })
    return {
      status: result.status,
      stderr: result.stderr,
      commands: readFileSync(log, "utf8").trim().split("\n"),
      summary: result.status === 0 ? readFileSync(summary, "utf8") : null,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("repositories without a custom updater retain the package loop", () => {
  const result = runUpdate()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.commands, [
    "update --latest @tscircuit/3d-viewer",
    "update --latest @tscircuit/core",
  ])
  assert.equal(result.summary, "Automated package update\n")
})

test("custom updater runs with validation before PR creation", () => {
  const result = runUpdate({ custom: true })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.commands, [
    "run scripts/update-packages.ts",
    "test",
    "tsc --noEmit",
    "run build",
  ])
})

test("validation failure stops before later commands and summary publication", () => {
  const result = runUpdate({ custom: true, fail: "test" })
  assert.equal(result.status, 1)
  assert.deepEqual(result.commands, ["run scripts/update-packages.ts", "test"])
  assert.equal(result.summary, null)
})
