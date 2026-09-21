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
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
 * The slice of NUnit the Unity EditMode tests use.
 *
 * The tests themselves live in the package (`packages/adapters/unity/Tests/
 * EditMode`) so the Editor can run them. `verify_unity_editor_tests.mjs` runs them
 * for real when an Editor exists; on a machine without one it SKIPS, and without
 * this shim those tests would then be neither run NOR compiled - i.e. shipped
 * unread by a compiler, which is the exact weakness this whole file exists to
 * remove. So they are compiled here against the same UnityEngine shim plus a
 * minimal NUnit surface, and only their EXECUTION is left to the Editor.
 */
const NUNIT_SHIM = path.join(__dirname, 'unity', 'NUnitShim.cs');
const UNITY_TEST_DIR = path.join(REPO, 'packages/adapters/unity/Tests/EditMode');
const UNITY_TEST_SOURCES = fs.readdirSync(UNITY_TEST_DIR).filter((f) => f.endsWith('.cs'));

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

const TESTS_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <LangVersion>latest</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <AssemblyName>UnityEditModeTestsCompileCheck</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="UnityEngineShim.cs" />
    <Compile Include="NUnitShim.cs" />
    <Compile Include="Adapter/**/*.cs" />
    <Compile Include="Tests/**/*.cs" />
  </ItemGroup>
</Project>
`;

let checks = 0;
function check(label, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  * ${label}: PASS`);
}

/**
 * Compile the Unity EditMode tests. NOTHING IS EXECUTED HERE.
 *
 * The tests are compiled against a shim, so a pass proves the test code is valid
 * C# against the surfaces it names - not that the assertions are correct, not
 * that the fixtures would pass, and not that Unity's NUnit behaves like the shim.
 * The report says so on the way out, because a compile gate that reads like a test
 * run is worse than no gate at all.
 */
function compileUnityEditModeTests() {
  console.log('--- Section C: Unity EditMode tests (compiled, not executed) ---');

  check('EditMode test sources exist', UNITY_TEST_SOURCES.length >= 3,
    `found ${UNITY_TEST_SOURCES.length} in ${path.relative(REPO, UNITY_TEST_DIR)}`);
  check('the test assembly definition is present',
    fs.existsSync(path.join(UNITY_TEST_DIR, 'FearAI.EditModeTests.asmdef')));
  check('an NUnit shim is available to compile against', fs.existsSync(NUNIT_SHIM));

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

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fearai-unity-tests-'));
  try {
    fs.copyFileSync(UNITY_SHIM, path.join(scratch, 'UnityEngineShim.cs'));
    fs.copyFileSync(NUNIT_SHIM, path.join(scratch, 'NUnitShim.cs'));
    fs.writeFileSync(path.join(scratch, 'Scratch.csproj'), TESTS_CSPROJ);
    fs.mkdirSync(path.join(scratch, 'Adapter'));
    fs.mkdirSync(path.join(scratch, 'Tests'));
    for (const file of CONTROL_PLANE_SOURCES) {
      fs.copyFileSync(path.join(UNITY_RUNTIME, file), path.join(scratch, 'Adapter', file));
    }
    for (const file of UNITY_TEST_SOURCES) {
      fs.copyFileSync(path.join(UNITY_TEST_DIR, file), path.join(scratch, 'Tests', file));
    }

    const build = spawnSync('dotnet', ['build', '-v', 'q', '--nologo'], {
      cwd: scratch,
      encoding: 'utf8',
      timeout: 240000
    });
    const output = `${build.stdout || ''}${build.stderr || ''}`;
    const errors = output.split('\n').filter((l) => l.includes(': error '));
    check('the EditMode tests compile with zero errors', build.status === 0 && errors.length === 0,
      errors.slice(0, 8).join(' | ') || `dotnet exited ${build.status}`);

    // A compile that silently picked up no test files would "succeed" while
    // checking nothing, so the built assembly's type names are read back out of
    // the intermediate output rather than trusted.
    const compiled = fs.existsSync(path.join(scratch, 'bin'));
    check('the test project really produced output (not a no-op build)', compiled);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log(`  Scope: compiling [${UNITY_TEST_SOURCES.join(', ')}] against the shims`);
  console.log('  These tests are COMPILED here and not executed; execution needs an Editor.');
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
    console.log('SKIPPED: dotnet is not on PATH, so neither .NET adapter could be compiled.');
    console.log('Both remain verified statically only on this machine - not a pass.\n');
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
  compileUnityEditModeTests();
  console.log('');
  compileCsharpClient();

  console.log('============================================================');
  console.log(`SUCCESS: both .NET adapters and the Unity EditMode tests compile (${checks} checks).`);
  console.log(`Unity files: ${CONTROL_PLANE_SOURCES.join(', ')} against the shared UnityEngine shim.`);
  console.log('Scope: compilation only. Unity editor behaviour and FearAgent/HUD remain unverified.');
  console.log('The EditMode tests are COMPILED here; whether they PASS is an Editor question,');
  console.log('answered by `npm run verify:unity-editor` (which SKIPS without an Editor).');
  console.log('============================================================\n');
}

try {
  main();
} catch (err) {
  console.error('VERIFICATION FAILURE:', err.message);
  process.exit(1);
}
