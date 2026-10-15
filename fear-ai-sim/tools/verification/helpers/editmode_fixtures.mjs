/**
 * tools/verification/helpers/editmode_fixtures.mjs
 *
 * The Unity EditMode fixture roster and its `[Test]` count, read out of the test
 * SOURCES rather than written down beside them.
 *
 * WHY THIS EXISTS AND WHY IT IS SHARED
 * Two different gates look at the same fixtures: `verify_dotnet_adapters_compile.mjs`
 * compiles and RUNS them outside the Editor, against the shims; and
 * `verify_unity_editor_tests.mjs` runs them inside a real Editor, or skips and says
 * what it could not do. Until now each held its own hand-written list, and they
 * disagreed: the Editor gate's list named four fixtures and omitted
 * `FearEncryptedStoreEditModeTests`, so every assertion the encrypted store fixture
 * makes could have gone uncompiled in the Editor and that gate would still have
 * reported success — a check satisfied by the absence of the thing it checks, which
 * is the defect class this repository keeps finding in its own gates.
 *
 * A roster written by hand also goes stale the first time a fixture is added, and
 * the failure it then produces reads as a puzzle rather than as a missing fixture.
 * Reading the sources means both gates compare their run against the tests as they
 * are right now, and sharing one implementation means they cannot drift apart again.
 *
 * WHAT THE PARSE IS, AND WHAT IT IS NOT
 * It pairs a `[TestFixture]` attribute with the `public class` that follows it, and
 * counts lines that are exactly `[Test]`. That is deliberately narrow: it does not
 * try to be a C# parser, and a fixture that uses a form this cannot read is not
 * silently ignored — both callers compare the parsed roster and count against what
 * actually ran, so a mismatch is reported as a failure rather than absorbed.
 */

import fs from 'node:fs';
import path from 'node:path';

export const EDITMODE_TEST_DIR = 'packages/adapters/unity/Tests/EditMode';

export function editModeTestDir(repoRoot) {
  return path.join(repoRoot, EDITMODE_TEST_DIR);
}

/** Every `.cs` file in the package's EditMode test directory, sorted. */
export function editModeTestSources(repoRoot) {
  return fs.readdirSync(editModeTestDir(repoRoot)).filter((name) => name.endsWith('.cs')).sort();
}

/**
 * Every fixture the sources declare: `{ file, name }` for each `[TestFixture]`
 * attribute paired with the class declaration that follows it.
 */
export function declaredFixtures(repoRoot) {
  const fixtures = [];
  for (const file of editModeTestSources(repoRoot)) {
    const lines = fs.readFileSync(path.join(editModeTestDir(repoRoot), file), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^\s*\[TestFixture\]\s*$/.test(lines[i])) continue;
      // The class declaration follows the attribute within a few lines, allowing for
      // the doc comment that sits between them in these fixtures.
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
        const match = lines[j].match(/^\s*public\s+(?:sealed\s+)?class\s+(\w+)/);
        if (match) { fixtures.push({ file, name: match[1] }); break; }
      }
    }
  }
  return fixtures;
}

/** How many `[TestFixture]` attributes the sources contain, paired or not. */
export function declaredFixtureAttributeCount(repoRoot) {
  return editModeTestSources(repoRoot).reduce((total, file) => {
    const text = fs.readFileSync(path.join(editModeTestDir(repoRoot), file), 'utf8');
    return total + (text.match(/^\s*\[TestFixture\]\s*$/gm) || []).length;
  }, 0);
}

/** How many `[Test]` methods the sources declare. */
export function declaredTestCount(repoRoot) {
  return editModeTestSources(repoRoot).reduce((total, file) => {
    const text = fs.readFileSync(path.join(editModeTestDir(repoRoot), file), 'utf8');
    return total + (text.match(/^\s*\[Test\]\s*$/gm) || []).length;
  }, 0);
}
