// tools/verification/unity/NUnitTestRunner.cs
//
// Runs the Unity adapter's EditMode fixtures OUTSIDE Unity, against the shims.
//
// WHY THIS EXISTS
// Until now the EditMode tests in `packages/adapters/unity/Tests/EditMode/` were
// compiled on every run and EXECUTED ONLY where a Unity Editor was installed -
// which, on every machine this repository has ever run on, is nowhere: the
// Editor probe self-skips and CI's `unity-editmode` job is inert until a runner
// is provisioned with a licence. So the fixtures were held to the standard of
// "does this compile", and a body that can never pass on ANY machine - a wrong
// constant, an inverted assertion, a field whose semantics changed under it, a
// `[Test]` that is not public - would have been discovered the day someone
// finally installed an Editor, or never. That is the same class of defect as the
// stub assertions this repository already found once in the UnityEngine shim: a
// gate that is satisfied by code that cannot work.
//
// Running them here closes the part of that gap a compiler can never close. It
// does NOT close the Editor gap and must never be reported as if it did:
//   * `NUnitShim.cs` is an implementation of the slice of NUnit these tests use,
//     not Unity's nunit.framework. Message formats, comparer semantics and the
//     behaviour of `Assert.Throws` differ.
//   * `UnityEngineShim.cs` is an implementation of the UnityEngine surface, not
//     Unity's API. A signature that differs from the real one compiles and runs
//     here and fails in the Editor.
//   * Nothing here is a player build (a different scripting profile), frame
//     scheduling, MonoBehaviour lifecycle, or anything rendered.
// The ledger therefore keeps the Unity row at `IMPLEMENTED_NOT_EDITOR_VERIFIED`.
// `verify_unity_editor_tests.mjs` stays the authority on an in-Editor result.
//
// WHY IT REFUSES RATHER THAN SKIPS
// Every way a test can be structurally incapable of running - non-public, an
// argument list, a non-void return, a fixture that declares no tests, a fixture
// with no usable constructor - is reported as a FAILURE with its reason, not
// silently omitted from the count. A runner that quietly runs 39 of 41 tests and
// prints "39 passed" is worse than one that runs none: it produces a green that
// cannot be distinguished from the real thing. Discovery is compared against the
// source declarations by `verify_dotnet_adapters_compile.mjs`, so a test that
// stopped being discovered is caught from outside as well.
//
// Hard Rule 9: this is not a test runner in the retired sense. It runs the Unity
// package's own fixtures, which exist for the Editor's NUnit, and it is invoked
// by one standalone probe; no suite was revived to hold it.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using NUnit.Framework;

namespace FearAI.EditModeFixtureRunner
{
    /// <summary>One test method and what happened to it.</summary>
    internal sealed class TestOutcome
    {
        public string Fixture;
        public string Name;
        public string Result;       // passed | failed | ignored
        public string Message = "";
    }

    public static class Program
    {
        /// <summary>
        /// Fixtures used to prove the runner itself can go red live in their own
        /// namespace, so a normal run can exclude them by one unambiguous rule
        /// rather than by a name convention that a rename could quietly break.
        /// </summary>
        internal const string SelfTestNamespace = "FearAI.EditModeFixtureRunner.SelfTest";

        public static int Main(string[] args)
        {
            string jsonPath = null;
            bool selfTest = false;

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--json" && i + 1 < args.Length) jsonPath = args[++i];
                else if (args[i] == "--selftest") selfTest = true;
                else
                {
                    Console.Error.WriteLine($"unrecognised argument: {args[i]}");
                    return 2;
                }
            }

            Console.WriteLine("============================================================");
            Console.WriteLine(selfTest
                ? "RUN THE FIXTURE RUNNER'S OWN SELF-TEST"
                : "RUN THE UNITY EditMode FIXTURES AGAINST THE SHIMS (no Editor)");
            Console.WriteLine("============================================================");
            Console.WriteLine();

            return selfTest ? RunSelfTest() : RunFixtures(jsonPath);
        }

        // ------------------------------------------------------------------
        // The real run
        // ------------------------------------------------------------------

        private static int RunFixtures(string jsonPath)
        {
            var assembly = Assembly.GetExecutingAssembly();
            var all = DiscoverCandidateTypes(assembly).ToList();
            // A type is a candidate if it is MARKED `[TestFixture]` or declares tests.
            // Not just the second: a fixture that is marked but declares nothing has to
            // reach RunFixture, which refuses it out loud, rather than being filtered
            // away here where its emptiness would look like a fixture that was never
            // there. (The probe also compares this roster against the one the sources
            // declare, so a fixture lost either way is caught from outside too.)
            var fixtures = all.Where(t => !IsSelfTest(t))
                .Where(t => t.IsDefined(typeof(TestFixtureAttribute), false) || DeclaresTests(t))
                .OrderBy(t => t.FullName, StringComparer.Ordinal)
                .ToList();
            var selfTestFixtures = all.Count(IsSelfTest);

            var outcomes = new List<TestOutcome>();
            var refusals = new List<string>();

            // The self-test fixtures are what make "0 failed" mean something. If they
            // are gone, the runner has no demonstrated ability to report a failure and
            // a clean run would be indistinguishable from a runner that passes
            // everything, so their absence is itself a failure.
            if (selfTestFixtures == 0)
            {
                refusals.Add("the runner's own self-test fixtures are missing from "
                    + $"{SelfTestNamespace}, so nothing proves this runner can report a failure at all");
            }

            Console.WriteLine($"  assembly: {assembly.GetName().Name}");
            Console.WriteLine($"  {fixtures.Count} fixture(s) discovered, {selfTestFixtures} self-test fixture(s) excluded by namespace");
            Console.WriteLine();

            foreach (var fixture in fixtures) RunFixture(fixture, outcomes, refusals);

            var passed = outcomes.Count(o => o.Result == "passed");
            var failed = outcomes.Count(o => o.Result == "failed") + refusals.Count;
            var ignored = outcomes.Count(o => o.Result == "ignored");

            foreach (var outcome in outcomes)
            {
                var label = outcome.Result == "passed" ? "PASS  " : outcome.Result == "ignored" ? "IGNORE" : "FAIL  ";
                Console.WriteLine($"  {label} {outcome.Fixture}.{outcome.Name}");
                if (outcome.Message.Length > 0) Console.WriteLine($"         {outcome.Message}");
            }
            foreach (var refusal in refusals) Console.WriteLine($"  FAIL   (structural) {refusal}");

            Console.WriteLine();
            Console.WriteLine("------------------------------------------------------------");
            Console.WriteLine($"  {outcomes.Count} [Test] method(s) ran: {passed} passed, "
                + $"{outcomes.Count(o => o.Result == "failed")} failed, {ignored} ignored");
            if (refusals.Count > 0) Console.WriteLine($"  {refusals.Count} structural refusal(s) — counted as failures");
            Console.WriteLine("------------------------------------------------------------");

            if (jsonPath != null)
            {
                WriteJson(jsonPath, assembly, fixtures, selfTestFixtures, outcomes, refusals);
                Console.WriteLine($"  wrote {jsonPath}");
            }

            // A run that executed nothing is the failure this whole file exists to make
            // impossible to mistake for a pass. Exit 2 rather than 0 so a caller that
            // only checks "non-zero means bad" still catches it.
            if (outcomes.Count == 0 && refusals.Count == 0)
            {
                Console.Error.WriteLine();
                Console.Error.WriteLine("REFUSED — no [Test] methods were discovered at all.");
                Console.Error.WriteLine("A green run of nothing is indistinguishable from a green run of everything.");
                return 2;
            }

            if (failed > 0)
            {
                Console.Error.WriteLine();
                Console.Error.WriteLine($"FAILED — {failed} of {outcomes.Count + refusals.Count} fixture case(s) did not pass.");
                return 1;
            }

            Console.WriteLine();
            Console.WriteLine($"SUCCESS: {passed} EditMode test(s) passed outside the Editor, "
                + $"{ignored} ignored, 0 failed.");
            Console.WriteLine("Scope: the fixtures' own bodies, as the SHIMS execute them. NOT an Editor result —");
            Console.WriteLine("NUnitShim is not Unity's nunit.framework and UnityEngineShim is not Unity's API.");
            return 0;
        }

        private static void RunFixture(Type fixture, List<TestOutcome> outcomes, List<string> refusals)
        {
            var methods = fixture.GetMethods(BindingFlags.Public | BindingFlags.NonPublic
                | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly);

            var tests = methods.Where(m => m.IsDefined(typeof(TestAttribute), false))
                .OrderBy(m => m.Name, StringComparer.Ordinal).ToList();
            var setups = methods.Where(m => m.IsDefined(typeof(SetUpAttribute), false)).ToList();
            var teardowns = methods.Where(m => m.IsDefined(typeof(TearDownAttribute), false)).ToList();
            var oneTimeSetups = methods.Where(m => m.IsDefined(typeof(OneTimeSetUpAttribute), false)).ToList();
            var oneTimeTearDowns = methods.Where(m => m.IsDefined(typeof(OneTimeTearDownAttribute), false)).ToList();

            if (tests.Count == 0)
            {
                refusals.Add($"{fixture.FullName} is marked [TestFixture] but declares no [Test] method, "
                    + "so it contributes nothing to the run — in the Editor it would report no tests at all");
                return;
            }
            // NUnit permits one of each; a second is silently ignored by some runners
            // and an error in others, and either way this fixture is not what it looks.
            if (setups.Count > 1) refusals.Add($"{fixture.FullName} declares {setups.Count} [SetUp] methods; NUnit allows one");
            if (teardowns.Count > 1) refusals.Add($"{fixture.FullName} declares {teardowns.Count} [TearDown] methods; NUnit allows one");

            object instance;
            try
            {
                instance = Activator.CreateInstance(fixture);
            }
            catch (Exception ex)
            {
                refusals.Add($"{fixture.FullName} could not be instantiated, so NONE of its "
                    + $"{tests.Count} test(s) could run: {Describe(ex)}");
                return;
            }

            try
            {
                foreach (var setup in oneTimeSetups) Invoke(setup, instance);
            }
            catch (Exception ex)
            {
                refusals.Add($"{fixture.FullName}: [OneTimeSetUp] failed, so its whole suite was skipped: {Describe(ex)}");
                return;
            }

            foreach (var test in tests)
            {
                var outcome = new TestOutcome { Fixture = fixture.Name, Name = test.Name };

                // A test that cannot be invoked is reported, never skipped. Each of
                // these is also what the Editor would refuse to run, which is the point.
                var refusal = SignatureRefusal(test);
                if (refusal != null)
                {
                    outcome.Result = "failed";
                    outcome.Message = refusal;
                    outcomes.Add(outcome);
                    continue;
                }

                if (test.IsDefined(typeof(IgnoreAttribute), false))
                {
                    var ignore = (IgnoreAttribute)test.GetCustomAttribute(typeof(IgnoreAttribute));
                    outcome.Result = "ignored";
                    outcome.Message = $"ignored: {ignore.Reason}";
                    outcomes.Add(outcome);
                    continue;
                }

                var setUpFailed = false;
                try
                {
                    foreach (var setup in setups) Invoke(setup, instance);
                }
                catch (Exception ex)
                {
                    setUpFailed = true;
                    outcome.Result = "failed";
                    outcome.Message = $"[SetUp] failed: {Describe(ex)}";
                }

                if (!setUpFailed)
                {
                    try
                    {
                        Invoke(test, instance);
                        outcome.Result = "passed";
                    }
                    catch (Exception ex)
                    {
                        outcome.Result = "failed";
                        outcome.Message = Describe(ex);
                    }
                }

                // NUnit does not run [TearDown] after a failed [SetUp], and mirroring
                // that matters here: a teardown that runs on half-built state is a
                // second failure reported as if it were the first.
                if (!setUpFailed)
                {
                    try
                    {
                        foreach (var teardown in teardowns) Invoke(teardown, instance);
                    }
                    catch (Exception ex)
                    {
                        outcome.Result = "failed";
                        outcome.Message = $"{outcome.Message} | [TearDown] failed: {Describe(ex)}".TrimStart(' ', '|');
                    }
                }

                outcomes.Add(outcome);
            }

            try
            {
                foreach (var teardown in oneTimeTearDowns) Invoke(teardown, instance);
            }
            catch (Exception ex)
            {
                refusals.Add($"{fixture.FullName}: [OneTimeTearDown] failed: {Describe(ex)}");
            }
        }

        /// <summary>
        /// Every way a `[Test]` can be undeliverable, stated as the Editor would see
        /// it. Returns null when the method is invocable.
        /// </summary>
        private static string SignatureRefusal(MethodInfo test)
        {
            if (!test.IsPublic)
                return $"the [Test] method is {Accessibility(test)}, not public — NUnit runs only public tests, "
                    + "so this one would never execute in the Editor either";
            if (test.ReturnType != typeof(void))
                return $"the [Test] method returns {test.ReturnType.Name}; NUnit runs only void tests";
            var parameters = test.GetParameters();
            if (parameters.Length > 0)
                return $"the [Test] method takes {parameters.Length} parameter(s); this shim implements no "
                    + "[TestCase]/[Values]/[TestCaseSource], so it could never be provided with one";
            return null;
        }

        private static string Accessibility(MethodInfo method)
        {
            if (method.IsPrivate) return "private";
            if (method.IsAssembly) return "internal";
            if (method.IsFamily) return "protected";
            if (method.IsFamilyOrAssembly) return "protected internal";
            return "non-public";
        }

        private static void Invoke(MethodInfo method, object instance) => method.Invoke(instance, null);

        /// <summary>
        /// Unwraps the reflection wrapper, so the message a fixture produced is the
        /// message reported. `MethodInfo.Invoke` otherwise buries every assertion
        /// failure inside a `TargetInvocationException` and the reader loses the
        /// fixture's own words.
        /// </summary>
        private static string Describe(Exception ex)
        {
            var inner = ex is TargetInvocationException tie && tie.InnerException != null ? tie.InnerException : ex;
            var message = inner is AssertionException
                ? inner.Message
                : $"{inner.GetType().Name}: {inner.Message}";
            // The first frame that is not reflection itself: enough to find the line
            // without pasting a stack into a run log.
            var frame = (inner.StackTrace ?? "").Split('\n')
                .Select(line => line.Trim())
                .FirstOrDefault(line => line.Length > 0 && !line.Contains("System.RuntimeMethodHandle"));
            return frame == null ? message : $"{message}  [{frame}]";
        }

        /// <summary>
        /// Every type in the assembly that could hold tests. Deliberately NOT filtered
        /// down to the ones that look runnable: a fixture with no usable constructor is
        /// one that would also fail in the Editor, and filtering it out here would turn
        /// "nine of this fixture's tests did not run" into a smaller green count. It
        /// reaches <see cref="RunFixture"/>, which refuses it out loud.
        /// </summary>
        private static IEnumerable<Type> DiscoverCandidateTypes(Assembly assembly)
        {
            Type[] types;
            try { types = assembly.GetTypes(); }
            catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
            return types.Where(t => t != null && t.IsClass && !t.IsAbstract);
        }

        private static bool DeclaresTests(Type type) =>
            type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic
                | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
                .Any(m => m.IsDefined(typeof(TestAttribute), false));

        private static bool IsSelfTest(Type type) =>
            (type.Namespace ?? "").StartsWith(SelfTestNamespace, StringComparison.Ordinal);

        // ------------------------------------------------------------------
        // The self-test: proof this runner can report a failure
        // ------------------------------------------------------------------

        /// <summary>
        /// Runs only the self-test fixtures and requires each outcome branch to have
        /// been taken. Without this, "0 failed" above would be a claim about a runner
        /// whose ability to say "failed" had never been exercised — and a runner that
        /// silently swallows exceptions looks exactly like a perfectly green suite.
        /// </summary>
        private static int RunSelfTest()
        {
            var fixtures = DiscoverCandidateTypes(Assembly.GetExecutingAssembly())
                .Where(IsSelfTest).Where(DeclaresTests)
                .OrderBy(t => t.FullName, StringComparer.Ordinal).ToList();

            var outcomes = new List<TestOutcome>();
            var refusals = new List<string>();
            foreach (var fixture in fixtures) RunFixture(fixture, outcomes, refusals);

            foreach (var outcome in outcomes)
                Console.WriteLine($"  {outcome.Result.ToUpperInvariant().PadRight(7)} {outcome.Name}"
                    + (outcome.Message.Length > 0 ? $"  — {outcome.Message}" : ""));

            var wanted = new (string Name, string Result)[]
            {
                ("PassesOnItsOwn", "passed"),
                ("FailsAnAssertion", "failed"),
                ("ThrowsAnUnexpectedException", "failed"),
                ("IsDeliberatelyIgnored", "ignored")
            };

            var problems = new List<string>();
            foreach (var (name, result) in wanted)
            {
                var found = outcomes.FirstOrDefault(o => o.Name == name);
                if (found == null) problems.Add($"{name} was never discovered, so the runner cannot even find all of its own fixtures");
                else if (found.Result != result) problems.Add($"{name} reported '{found.Result}', expected '{result}'");
            }
            if (refusals.Count > 0) problems.Add($"{refusals.Count} structural refusal(s): {string.Join("; ", refusals)}");
            if (outcomes.Count != wanted.Length) problems.Add($"{outcomes.Count} outcome(s) for {wanted.Length} self-test method(s)");

            Console.WriteLine();
            if (problems.Count > 0)
            {
                Console.Error.WriteLine("FAILED — the runner cannot report every outcome it must distinguish:");
                foreach (var problem in problems) Console.Error.WriteLine($"  - {problem}");
                return 1;
            }
            Console.WriteLine("SUCCESS: the runner distinguishes a pass, an assertion failure, an unexpected");
            Console.WriteLine("exception and an ignored test. Its '0 failed' on the real fixtures is therefore");
            Console.WriteLine("a result rather than an absence of one.");
            return 0;
        }

        // ------------------------------------------------------------------
        // Machine-readable result
        // ------------------------------------------------------------------

        private static void WriteJson(string path, Assembly assembly, List<Type> fixtures,
            int selfTestFixtures, List<TestOutcome> outcomes, List<string> refusals)
        {
            var json = new StringBuilder();
            string Quote(string value)
            {
                var escaped = new StringBuilder();
                foreach (var c in value ?? "")
                {
                    switch (c)
                    {
                        case '"': escaped.Append("\\\""); break;
                        case '\\': escaped.Append("\\\\"); break;
                        case '\n': escaped.Append("\\n"); break;
                        case '\r': escaped.Append("\\r"); break;
                        case '\t': escaped.Append("\\t"); break;
                        default:
                            if (c < ' ') escaped.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                            else escaped.Append(c);
                            break;
                    }
                }
                return $"\"{escaped}\"";
            }

            json.AppendLine("{");
            json.AppendLine($"  {Quote("kind")}: {Quote("unity-editmode-fixtures-run-outside-editor")},");
            json.AppendLine($"  {Quote("note")}: {Quote("The Unity adapter's EditMode fixtures EXECUTED against the shims (UnityEngineShim + NUnitShim). Not an Editor result: neither shim is Unity's own API.")},");
            json.AppendLine($"  {Quote("assembly")}: {Quote(assembly.GetName().Name)},");
            json.AppendLine($"  {Quote("fixtures")}: [{string.Join(", ", fixtures.Select(f => Quote(f.FullName)))}],");
            json.AppendLine($"  {Quote("selfTestFixturesExcluded")}: {selfTestFixtures},");
            json.AppendLine($"  {Quote("total")}: {outcomes.Count},");
            json.AppendLine($"  {Quote("passed")}: {outcomes.Count(o => o.Result == "passed")},");
            json.AppendLine($"  {Quote("failed")}: {outcomes.Count(o => o.Result == "failed")},");
            json.AppendLine($"  {Quote("ignored")}: {outcomes.Count(o => o.Result == "ignored")},");
            json.AppendLine($"  {Quote("structuralRefusals")}: [{string.Join(", ", refusals.Select(Quote))}],");
            json.AppendLine($"  {Quote("tests")}: [");
            json.AppendLine(string.Join(",\n", outcomes.Select(o =>
                $"    {{ {Quote("fixture")}: {Quote(o.Fixture)}, {Quote("name")}: {Quote(o.Name)}, "
                + $"{Quote("outcome")}: {Quote(o.Result)}, {Quote("message")}: {Quote(o.Message)} }}")));
            json.AppendLine("  ]");
            json.AppendLine("}");

            File.WriteAllText(path, json.ToString());
        }
    }
}

namespace FearAI.EditModeFixtureRunner.SelfTest
{
    /// <summary>
    /// Lift the four outcome branches a runner must be able to tell apart. These
    /// are deliberately the ONLY fixtures excluded from a real run, and their
    /// presence is required by it: a runner that could not report a failure would
    /// pass everything, and that is the one failure a self-green runner cannot show.
    /// </summary>
    [TestFixture]
    public class SelfTestOutcomeFixture
    {
        [SetUp]
        public void SetUp() { }

        [TearDown]
        public void TearDown() { }

        [Test]
        public void PassesOnItsOwn()
        {
            Assert.IsTrue(true);
            Assert.AreEqual(2, 1 + 1);
        }

        [Test]
        public void FailsAnAssertion()
        {
            // Runs against the same assert surface as every real fixture and MUST come
            // back failed. If it ever passes, every "0 failed" above it means nothing.
            Assert.IsFalse(true, "this self-test asserts a falsehood on purpose");
        }

        [Test]
        public void ThrowsAnUnexpectedException()
        {
            throw new InvalidOperationException("the self-test throws on purpose");
        }

        [Test]
        [Ignore("the self-test must also prove an [Ignore] is reported as ignored")]
        public void IsDeliberatelyIgnored() { }
    }
}
