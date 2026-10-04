const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const vm = require("node:vm")
const packageJson = require("../package.json")

const root = path.resolve(__dirname, "..")
const remoteTemplate = {
  filename: "CODE_GUIDELINES.md",
  url: "https://templates.invalid/guidelines.md",
  isRemote: true,
}

// Exercise main(), selection and copying with real temporary files. Only the
// interactive prompt, network, process status and console are replaced.
async function runCli(
  t,
  { template = remoteTemplate, response, existing } = {},
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tscircuit-plop-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const destination = path.join(directory, remoteTemplate.filename)
  if (existing !== undefined) await fs.writeFile(destination, existing)
  const processState = {
    cwd: () => directory,
    exitCode: 0,
    exit: (code) => {
      throw new Error(`Unexpected process.exit(${code})`)
    },
  }
  const messages = []
  const source = await fs.readFile(path.join(root, "index.js"), "utf8")
  await vm.runInNewContext(
    source,
    {
      __dirname: root,
      require: (name) => {
        if (name === "prompts") return async () => ({ file: template })
        if (name === "./package.json") return packageJson
        if (name === "child_process") {
          return {
            execSync: () => assert.fail("Tests must not install updates"),
          }
        }
        return require(name)
      },
      process: processState,
      console: {
        log: (...args) => messages.push(args.join(" ")),
        warn: (...args) => messages.push(args.join(" ")),
        error: (...args) => messages.push(args.join(" ")),
      },
      fetch: async (url) => {
        if (url === "https://registry.npmjs.org/@tscircuit/plop") {
          return new Response(
            JSON.stringify({ "dist-tags": { latest: packageJson.version } }),
          )
        }
        assert.equal(url, remoteTemplate.url)
        if (response instanceof Error) throw response
        return response
      },
    },
    { filename: path.join(root, "index.js") },
  )
  return { directory, destination, processState, messages }
}

for (const status of [404, 429, 500]) {
  test(`HTTP ${status} keeps an existing file and reports failure`, async (t) => {
    const original = "# Handwritten project instructions\nKeep these.\n"
    const result = await runCli(t, {
      response: new Response("Remote error page", { status }),
      existing: original,
    })
    assert.equal(await fs.readFile(result.destination, "utf8"), original)
    assert.equal(result.processState.exitCode, 1)
    assert.ok(
      result.messages.some((message) => message.includes(`HTTP ${status}`)),
    )
    assert.ok(
      result.messages.every(
        (message) => !message.includes("downloaded successfully"),
      ),
    )
  })
}

test("HTTP failure does not create a new destination", async (t) => {
  const result = await runCli(t, {
    response: new Response("Missing", { status: 404 }),
  })
  await assert.rejects(fs.access(result.destination), { code: "ENOENT" })
  assert.equal(result.processState.exitCode, 1)
})

test("network and response-body failures preserve the existing file", async (t) => {
  for (const response of [
    new Error("Network unavailable"),
    {
      ok: true,
      text: async () => {
        throw new Error("Body interrupted")
      },
    },
  ]) {
    const result = await runCli(t, { response, existing: "original" })
    assert.equal(await fs.readFile(result.destination, "utf8"), "original")
    assert.equal(result.processState.exitCode, 1)
    assert.ok(
      result.messages.every(
        (message) => !message.includes("downloaded successfully"),
      ),
    )
  }
})

test("successful remote downloads retain their full text", async (t) => {
  const content = "# Guidelines\r\nUTF-8: café — ✓\r\n"
  const result = await runCli(t, {
    response: new Response(content),
    existing: "old",
  })
  assert.equal(await fs.readFile(result.destination, "utf8"), content)
  assert.equal(result.processState.exitCode, 0)
  assert.ok(
    result.messages.some((message) =>
      message.includes("downloaded successfully"),
    ),
  )
})

test("local copying still works and missing local templates report failure", async (t) => {
  const copied = await runCli(t, {
    template: { filename: "LICENSE", isRemote: false },
  })
  assert.equal(
    await fs.readFile(path.join(copied.directory, "LICENSE"), "utf8"),
    await fs.readFile(path.join(root, "template-files", "LICENSE"), "utf8"),
  )
  assert.equal(copied.processState.exitCode, 0)
  const missing = await runCli(t, {
    template: { filename: "missing-template", isRemote: false },
  })
  assert.equal(missing.processState.exitCode, 1)
})

test("canceling selection exits successfully without writing a file", async (t) => {
  const result = await runCli(t, { template: null })
  assert.deepEqual(await fs.readdir(result.directory), [])
  assert.equal(result.processState.exitCode, 0)
})
