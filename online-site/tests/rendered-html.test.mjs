import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

async function filesUnder(directory) {
  const result = [];
  for (const name of await readdir(directory)) {
    const file = new URL(`${name}`, directory);
    const info = await stat(file);
    if (info.isDirectory()) result.push(...await filesUnder(new URL(`${name}/`, directory)));
    else result.push(file);
  }
  return result;
}

test("build contains the invoice manager pages and APIs", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const files = await filesUnder(dist);
  assert.ok(files.some((file) => file.pathname.endsWith("server/index.js")));
  const javascript = (await Promise.all(
    files.filter((file) => file.pathname.endsWith(".js")).map((file) => readFile(file, "utf8")),
  )).join("\n");
  assert.match(javascript, /Shipowner Invoice Manager/);
  assert.match(javascript, /Releases@coscoshipping\.co\.uk/);
  assert.match(javascript, /Could you please also help extend the below container/);
  assert.match(javascript, /待 Release/);
  assert.match(javascript, /COSCO 草稿待保存/);
  assert.match(javascript, /需延长/);
  assert.doesNotMatch(javascript, /External Email\. Please do not open suspicious links/);
});
