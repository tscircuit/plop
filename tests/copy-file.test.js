const { test, before, after } = require("node:test")
const assert = require("node:assert")
const http = require("node:http")
const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")

const { copyFile } = require("../index.js")

let server
let baseUrl
let tmpDir
let originalCwd

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/good-template") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("template content")
    } else {
      res.writeHead(404, { "content-type": "text/html" })
      res.end("<html>404 not found</html>")
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plop-test-"))
  originalCwd = process.cwd()
  process.chdir(tmpDir)
})

after(async () => {
  process.chdir(originalCwd)
  server.close()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test("remote template that returns 404 must not be written to disk", async () => {
  const dest = path.join(tmpDir, "missing-template.txt")
  await copyFile({
    filename: "missing-template.txt",
    url: `${baseUrl}/missing-template`,
    isRemote: true,
  })
  const exists = await fs
    .access(dest)
    .then(() => true)
    .catch(() => false)
  assert.strictEqual(
    exists,
    false,
    "a 404 response body must never be written as the template file",
  )
})

test("remote template that returns 200 is written to disk", async () => {
  const dest = path.join(tmpDir, "good-template.txt")
  await copyFile({
    filename: "good-template.txt",
    url: `${baseUrl}/good-template`,
    isRemote: true,
  })
  const content = await fs.readFile(dest, "utf8")
  assert.strictEqual(content, "template content")
})
