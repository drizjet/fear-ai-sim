/**
 * tools/verification/verify_dotnet_adapters_compile.mjs
 *
 * Compiles the two .NET-family adapters, because "it was only read by a human"
 * is the weakest form of verification this repository still ships:
 *
 *   A. Unity (`packages/adapters/unity/Runtime`) OUTSIDE the Unity Editor,
 *      against the shared UnityEngine shim, so the adapter is type-checked rather
 *      than only read. The same shim lets
 *      `verify_unity_adapter_behavior.mjs` EXECUTE this adapter against a live
 *      server, so this section is now a weaker companion to that one rather than
 *      the only Unity evidence there is.
 *   B. The standalone C# client (`packages/adapters/csharp`), rebuilt for real.
 *
 * WHY THIS EXISTS
 * The ledger carries "Unity verified only statically" as a standing limit, and
 * that limit was real: every Unity change was shipped unread-by-a-compiler, so a
 * typo, a renamed member or a bad argument count would be discovered by a host in
 * the editor instead of here. Editor behaviour still cannot be checked without
 * the editor, but "does this file compile" can be, and it is where those defects
 * actually live.
 *
 * SCOPE
 * Deliberately the CONTROL-PLANE surface only: `FearAIClient.cs` and
 * `FearTypes.cs`. Those are the files that carry session identity, registration,
 * teardown and trauma authoring. `FearAgent.cs` and `FearAgentHUD.cs` would pull
 * in NavMesh, Physics, GUI, Texture2D and audio stubs - a second implementation
 * to maintain for files this check does not need to cover - so they stay
 * statically checked only, which is already their standing position in the
 * ledger.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT
 * Proves: those two files compile as C#, and their members line up with each
 * other (fields, signatures, argument counts, generics, nullability of its own
 * types).
 * Does NOT prove: that the stubs match Unity's real API, that MonoBehaviour
 * lifecycle is invoked as declared, or that the adapter behaves correctly in a
 * running engine. A stub-signature mismatch would compile here and fail in the
 * editor, so this narrows the Unity gap rather than closing it.
 *
 * SECTION C IS THE ONE THAT IS NOT ONLY A COMPILE
 * The Unity EditMode fixtures are compiled here AND EXECUTED, against the same
 * two shims, by `tools/verification/unity/NUnitTestRunner.cs`. The run's own JSON
 * result is then checked against the fixture roster and the `[Test]` count DERIVED
 * from the test sources, so a test that stopped being discovered cannot hide
 * behind a passing number. That is the point of the section: a fixture body that
 * can never pass on any machine - a wrong constant, an inverted assertion, a field
 * whose semantics moved under it, a `[Test]` that is not public - would otherwise
 * be found the day someone finally provisions an Editor, or never. It does NOT
 * promote the Unity row: `NUnitShim.cs` is not Unity's nunit.framework and
 * `UnityEngineShim.cs` is not Unity's API, so `verify_unity_editor_tests.mjs`
 * remains the only authority on an in-Editor result.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  declaredFixtureAttributeCount,
  declaredFixtures,
  declaredTestCount,
  editModeTestDir,
  editModeTestSources
} from './helpers/editmode_fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');
const UNITY_RUNTIME = path.join(REPO, 'packages/adapters/unity/Runtime');
const CSHARP_PROJECT = path.join(REPO, 'packages/adapters/csharp/FearAI.Client.csproj');

/**
 * The UnityEngine surface, from the ONE shim this repository maintains.
 *
 * This used to be a private set of empty stub methods, and that was a defect the
 * behavioural harness then exercised into the open: `JsonUtility.FromJson<T>`
 * returning `Activator.CreateInstance<T>()` and `UnityWebRequest.responseCode`
 * being hardcoded to 200 mean every control-plane path reads as a success, so the
 * compile check was satisfied by code that could not work. There is now one shim
 * (`tools/verification/unity/UnityEngineShim.cs`), it implements the surface with
 * real HTTP, real JSON and real storage, and BOTH probes compile the real adapter
 * against it: this one to prove it type-checks, and
 * `verify_unity_adapter_behavior.mjs` to prove it runs.
 */
const UNITY_SHIM = path.join(__dirname, 'unity', 'UnityEngineShim.cs');

/**
 * The slice of NUnit the Unity EditMode tests use, and the runner that executes
 * them against it.
 *
 * The tests themselves live in the package (`packages/adapters/unity/Tests/
 * EditMode`) so the Editor can run them. `verify_unity_editor_tests.mjs` runs them
 * for real when an Editor exists; on a machine without one it SKIPS, and without
 * these two files the fixtures would then be neither run NOR compiled - i.e.
 * shipped unread by a compiler, which is the exact weakness this whole file exists
 * to remove. So they are compiled here against the same UnityEngine shim plus a
 * minimal NUnit surface, and now also EXECUTED against them. An in-Editor result
 * stays the Editor's to produce.
 */
const NUNIT_SHIM = path.join(__dirname, 'unity', 'NUnitShim.cs');
const NUNIT_RUNNER = path.join(__dirname, 'unity', 'NUnitTestRunner.cs');
// The roster and the test count come from the test SOURCES through a helper shared
// with `verify_unity_editor_tests.mjs`, so the outside-Editor run and the in-Editor
// run cannot hold different ideas of which fixtures exist.
const UNITY_TEST_DIR = editModeTestDir(REPO);
const UNITY_TEST_SOURCES = editModeTestSources(REPO);

/** The control-plane files this check compiles. Named explicitly so the scope
 * cannot widen silently into files the stubs do not cover. */
const CONTROL_PLANE_SOURCES = [
  'FearAIClient.cs',
  'FearTypes.cs',
  'FearSessionStore.cs',
  'FearSigning.cs',
  // The encrypted store container. It has NO UnityEngine dependency on purpose, so
  // the store interop probe can compile and RUN it outside the Editor and
  // byte-compare its output against the Node and Godot writers - which is the only
  // way a container shared by three runtimes gets checked on a machine with no
  // Editor installed at all.
  'FearEncryptedStore.cs'
];

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <LangVersion>latest</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <AssemblyName>UnityAdapterStubCheck</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="UnityEngineShim.cs" />
    <Compile Include="Adapter/**/*.cs" />
  </ItemGroup>
</Project>
`;

// An EXECUTABLE, not a library: the point of Section C is that the fixtures run.
const TESTS_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <LangVersion>latest</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <AssemblyName>UnityEditModeFixtureRun</AssemblyName>
    <StartupObject>FearAI.EditModeFixtureRunner.Program</StartupObject>
    <NoWarn>CS0649;CS0414;CS0169</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="UnityEngineShim.cs" />
    <Compile Include="NUnitShim.cs" />
    <Compile Include="NUnitTestRunner.cs" />
    <Compile Include="Adapter/**/*.cs" />
    <Compile Include="Tests/**/*.cs" />
  </ItemGroup>
</Project>
`;

let checks = 0;
// Filled in by Section C so the closing summary can quote what actually ran rather
// than a number written by hand — the previous form printed a count that stayed
// correct only as long as nobody changed the fixtures.
let editModeRun = { fixtures: 0, declared: 0, ran: 0 };
function check(label, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  * ${label}: PASS`);
}

/**
 * Compile the Unity EditMode fixtures AND run them against the shims.
 *
 * A pass proves the fixtures' own bodies execute and assert successfully against
 * this repository's implementations of UnityEngine and NUnit. It does not prove
 * Unity's NUnit or Unity's API behave the same way, and the report says so on the
 * way out, because a shim run that reads like an Editor run would be worse than no
 * run at all.
 */
function runUnityEditModeFixtures() {
  console.log('--- Section C: Unity EditMode fixtures (compiled AND executed against the shims) ---');

  check('EditMode test sources exist', UNITY_TEST_SOURCES.length >= 3,
    `found ${UNITY_TEST_SOURCES.length} in ${path.relative(REPO, UNITY_TEST_DIR)}`);
  check('the test assembly definition is present',
    fs.existsSync(path.join(UNITY_TEST_DIR, 'FearAI.EditModeTests.asmdef')));
  check('an NUnit shim is available to compile against', fs.existsSync(NUNIT_SHIM));
  check('the fixture runner is available to execute them', fs.existsSync(NUNIT_RUNNER));

  const asmdef = JSON.parse(fs.readFileSync(path.join(UNITY_TEST_DIR, 'FearAI.EditModeTests.asmdef'), 'utf8'));
  // These two are what make the tests exist for the Editor at all: without the
  // runtime reference the fixtures cannot see the adapter, and without the test
  // framework references `[Test]` means nothing.
  check('the asmdef references the adapter runtime assembly',
    asmdef.references.includes('FearAI.Runtime'), JSON.stringify(asmdef.references));
  check('the asmdef references the Unity test framework assemblies',
    asmdef.references.includes('UnityEngine.TestRunner') && asmdef.references.includes('UnityEditor.TestRunner'),
    JSON.stringify(asmdef.references));
  check('the asmdef is guarded by UNITY_INCLUDE_TESTS, so it cannot leak into a player build',
    Array.isArray(asmdef.defineConstraints) && asmdef.defineConstraints.includes('UNITY_INCLUDE_TESTS'),
    JSON.stringify(asmdef.defineConstraints));
  check('the asmdef is Editor-only',
    Array.isArray(asmdef.includePlatforms) && asmdef.includePlatforms.includes('Editor') && asmdef.includePlatforms.length === 1,
    JSON.stringify(asmdef.includePlatforms));

  const fixtureRoster = declaredFixtures(REPO);
  const declaredTests = declaredTestCount(REPO);
  const attributeCount = declaredFixtureAttributeCount(REPO);
  check('every [TestFixture] attribute pairs with a class declaration',
    fixtureRoster.length === attributeCount,
    `${attributeCount} attribute(s) but ${fixtureRoster.length} class declaration(s) parsed`);
  // Floors, not targets. They ratchet against a fixture or a test disappearing
  // quietly; the equalities below are what make the run's count mean something.
  // Raise them when coverage grows — lowering one is a decision, not maintenance.
  check('the fixtures still cover what the ledger claims',
    fixtureRoster.length >= 5 && declaredTests >= 40,
    `${fixtureRoster.length} fixture(s) and ${declaredTests} [Test] method(s) declared`);
  console.log(`  Declared by the sources: ${fixtureRoster.length} fixture(s), ${declaredTests} [Test] method(s)`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fearai-unity-tests-'));
  try {
    fs.copyFileSync(UNITY_SHIM, path.join(scratch, 'UnityEngineShim.cs'));
    fs.copyFileSync(NUNIT_SHIM, path.join(scratch, 'NUnitShim.cs'));
    fs.copyFileSync(NUNIT_RUNNER, path.join(scratch, 'NUnitTestRunner.cs'));
    fs.writeFileSync(path.join(scratch, 'Scratch.csproj'), TESTS_CSPROJ);
    fs.mkdirSync(path.join(scratch, 'Adapter'));
    fs.mkdirSync(path.join(scratch, 'Tests'));
    for (const file of CONTROL_PLANE_SOURCES) {
      fs.copyFileSync(path.join(UNITY_RUNTIME, file), path.join(scratch, 'Adapter', file));
    }
    for (const file of UNITY_TEST_SOURCES) {
      fs.copyFileSync(path.join(UNITY_TEST_DIR, file), path.join(scratch, 'Tests', file));
    }

    const build = spawnSync('dotnet', ['build', '-c', 'Release', '-v', 'q', '--nologo'], {
      cwd: scratch,
      encoding: 'utf8',
      timeout: 240000
    });
    const output = `${build.stdout || ''}${build.stderr || ''}`;
    const errors = output.split('\n').filter((l) => l.includes(': error '));
    check('the EditMode tests compile with zero errors', build.status === 0 && errors.length === 0,
      errors.slice(0, 8).join(' | ') || `dotnet exited ${build.status}`);

    const runnerDll = path.join(scratch, 'bin', 'Release', 'net8.0', 'UnityEditModeFixtureRun.dll');
    check('the build produced a runnable fixture runner, not just an assembly on disk',
      fs.existsSync(runnerDll), runnerDll);

    // BEFORE the fixtures run, the runner must show it can report a failure. A
    // runner that swallows exceptions prints the same green summary as a perfectly
    // correct suite, so its ability to go red is the precondition for reading
    // "0 failed" as a result rather than an absence of one.
    const selfTest = spawnSync('dotnet', [runnerDll, '--selftest'], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000
    });
    check('the runner distinguishes a pass, an assertion failure, an exception and an [Ignore]',
      selfTest.status === 0,
      `${selfTest.stdout || ''}${selfTest.stderr || ''}`.trim().split(/\r?\n/).slice(-4).join(' | '));

    const resultsPath = path.join(scratch, 'editmode-fixtures.json');
    const run = spawnSync('dotnet', [runnerDll, '--json', resultsPath], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000
    });
    const runOutput = `${run.stdout || ''}${run.stderr || ''}`;
    check('the runner wrote its own machine-readable result', fs.existsSync(resultsPath));

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Printed BEFORE the checks, and individually. A count mismatch is the symptom
    // and the refusal is the cause, so a reader must see the cause even when an
    // earlier check is the one that fails; a one-line "32 vs 41" would send them to
    // build the project by hand to find out which fixture went missing.
    const failingCases = results.tests.filter((test) => test.outcome === 'failed');
    for (const test of failingCases) console.log(`      FAILED  ${test.fixture}.${test.name}\n              ${test.message}`);
    for (const refusal of results.structuralRefusals) console.log(`      REFUSED ${refusal}`);

    // The two checks that make a green count trustworthy: the run has to account for
    // exactly the tests the SOURCES declare, and for exactly the fixtures they
    // declare. A runner that discovered 39 of 41 tests and printed "39 passed" would
    // otherwise be indistinguishable from the real thing.
    check('the run accounts for every [Test] method the sources declare, and no more',
      results.total === declaredTests, `${results.total} case(s) ran vs ${declaredTests} declared`);
    const ranFixtures = results.fixtures.map((name) => name.split('.').pop()).sort();
    const wantedFixtures = fixtureRoster.map((fixture) => fixture.name).sort();
    check('the fixture roster the runner found is the roster the sources declare',
      JSON.stringify(ranFixtures) === JSON.stringify(wantedFixtures),
      `ran [${ranFixtures.join(', ')}] vs declared [${wantedFixtures.join(', ')}]`);
    check('every fixture case that ran passed',
      results.failed === 0 && results.structuralRefusals.length === 0,
      [...results.structuralRefusals,
        ...failingCases.map((test) => `${test.fixture}.${test.name}: ${test.message}`)]
        .slice(0, 5).join(' | '));
    check('no fixture case was skipped, so the count is not padded by ignores',
      results.ignored === 0, `${results.ignored} ignored`);
    // Last, because it is a statement about the runner's own signalling rather than
    // about the fixtures, and it must agree with what the JSON already said.
    check('the fixture run exits 0, agreeing with the result it wrote',
      run.status === 0, runOutput.trim().split(/\r?\n/).slice(-6).join(' | ') || `dotnet exited ${run.status}`);

    editModeRun = { fixtures: fixtureRoster.length, declared: declaredTests, ran: results.total };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log(`  Scope: compiling and RUNNING [${UNITY_TEST_SOURCES.join(', ')}] against the shims`);
  console.log('  NOT an Editor result: the shims are this repository\'s implementations of UnityEngine');
  console.log('  and NUnit, so `npm run verify:unity-editor` remains the only authority on what');
  console.log('  Unity itself does with these fixtures, and the ledger keeps the Editor qualifier.');
}

function compileCsharpClient() {
  console.log('--- Section B: standalone C# client (real rebuild) ---');
  check('C# client project exists', fs.existsSync(CSHARP_PROJECT));

  // `-t:Rebuild` rather than a plain build: an up-to-date-check pass would
  // report success without compiling anything, which is exactly the way a
  // compile gate goes quietly useless.
  const build = spawnSync('dotnet', ['build', CSHARP_PROJECT, '-t:Rebuild', '-v', 'q', '--nologo'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 240000
  });
  const output = `${build.stdout || ''}${build.stderr || ''}`;
  const errors = output.split('\n').filter((l) => l.includes(': error '));
  check('C# client rebuilds with zero errors', build.status === 0 && errors.length === 0,
    errors.slice(0, 6).join(' | ') || `dotnet exited ${build.status}`);
  check('C# client assembly produced',
    /Build succeeded/.test(output), output.split('\n').slice(-4).join(' | '));
  console.log('');
}

function main() {
  console.log('============================================================');
  console.log('VERIFY .NET ADAPTERS COMPILE (Unity shimmed, C# real)');
  console.log('============================================================\n');

  const dotnet = spawnSync('dotnet', ['--version'], { encoding: 'utf8' });
  if (dotnet.error || dotnet.status !== 0) {
    // Named as SKIPPED so the probe runner treats it as NOT PROVEN rather than as a
    // pass, and so CI's FEAR_AI_EXPECT_PROVEN can promote it to a failure. That
    // declaration is what stops a runner that lost its .NET SDK from reporting the
    // same green suite as one that has it, with 41 Unity fixture cases unexecuted.
    console.log('SKIPPED: dotnet is not on PATH, so neither .NET adapter could be compiled,');
    console.log('the Unity EditMode fixtures could not be COMPILED OR RUN, and no Unity');
    console.log('behaviour outside the Editor was proven on this machine.');
    console.log('');
    console.log('  CI declares this runtime proven (`FEAR_AI_EXPECT_PROVEN` names');
    console.log('  `verify_dotnet_adapters_compile`, and the runner image ships the .NET SDK), so a');
    console.log('  SKIPPED line there is an environment defect and fails the job instead of');
    console.log('  reporting green.');
    console.log('');
    return;
  }
  console.log(`dotnet ${String(dotnet.stdout).trim()} detected.\n`);

  console.log('--- Section A: Unity control-plane adapter (shared UnityEngine shim) ---');

  const runtimeSources = fs.readdirSync(UNITY_RUNTIME).filter((f) => f.endsWith('.cs'));
  check('Unity Runtime exposes adapter sources', runtimeSources.length >= 3, `found ${runtimeSources.length}`);
  check('Control-plane sources are present',
    CONTROL_PLANE_SOURCES.every((f) => runtimeSources.includes(f)),
    `missing [${CONTROL_PLANE_SOURCES.filter((f) => !runtimeSources.includes(f))}]`);
  console.log(`  Scope: compiling [${CONTROL_PLANE_SOURCES.join(', ')}] against the shared UnityEngine shim`);
  const sources = CONTROL_PLANE_SOURCES;

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fearai-unity-stub-'));
  try {
    fs.copyFileSync(UNITY_SHIM, path.join(scratch, 'UnityEngineShim.cs'));
    fs.writeFileSync(path.join(scratch, 'Scratch.csproj'), CSPROJ);
    fs.mkdirSync(path.join(scratch, 'Adapter'));
    for (const file of sources) {
      fs.copyFileSync(path.join(UNITY_RUNTIME, file), path.join(scratch, 'Adapter', file));
    }

    const build = spawnSync('dotnet', ['build', '-v', 'q', '--nologo'], {
      cwd: scratch,
      encoding: 'utf8',
      timeout: 240000
    });
    const output = `${build.stdout || ''}${build.stderr || ''}`;

    // The compile is the assertion, so the failures are surfaced verbatim rather
    // than summarised: the whole value here is the compiler's own message.
    const errors = output.split('\n').filter((l) => l.includes(': error '));
    check('Unity adapter compiles with zero errors', build.status === 0 && errors.length === 0,
      errors.slice(0, 8).join(' | ') || `dotnet exited ${build.status}`);
    check('Compiler produced an assembly', fs.existsSync(path.join(scratch, 'bin')));
    // The stub must actually be reaching the compiler. An empty compile would
    // report success for the wrong reason, which is the way a check like this
    // goes quietly useless.
    const stubBuilt = fs.existsSync(path.join(scratch, 'obj'))
      || fs.existsSync(path.join(scratch, 'bin'));
    check('Stub project was really built (not a no-op)', stubBuilt);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log('');
  runUnityEditModeFixtures();
  console.log('');
  compileCsharpClient();

  console.log('============================================================');
  console.log(`SUCCESS: both .NET adapters compile and the Unity EditMode fixtures RUN (${checks} checks).`);
  console.log(`Unity files: ${CONTROL_PLANE_SOURCES.join(', ')} against the shared UnityEngine shim.`);
  console.log('The EditMode fixtures are executed here against the shims, so a body that can never');
  console.log(`pass is caught without an Editor (${editModeRun.ran} case(s) over ${editModeRun.fixtures} fixture(s)).`);
  console.log('Scope: Unity Editor behaviour, the player scripting profile and FearAgent/HUD remain');
  console.log('unverified, and `npm run verify:unity-editor` (which SKIPS without an Editor) stays');
  console.log('the only authority on what Unity itself does with these fixtures.');
  console.log('============================================================\n');
}

try {
  main();
} catch (err) {
  console.error('VERIFICATION FAILURE:', err.message);
  process.exit(1);
}
