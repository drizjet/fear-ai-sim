// tools/verification/unity/NUnitShim.cs
//
// The slice of NUnit the Unity EditMode tests use, so those tests can be
// COMPILED on a machine with no Unity Editor.
//
// WHY A SHIM AND NOT THE REAL NUNIT
// Unity ships its own `nunit.framework.dll` and pulls it in through the test
// framework package. There is no copy of it on a machine without the Editor, so a
// compile gate cannot reference it. This file supplies exactly the members the
// tests use, which is what lets `verify_dotnet_adapters_compile.mjs` answer "do
// the EditMode tests type-check" even when `verify_unity_editor_tests.mjs` has to
// skip.
//
// THE ASSERTIONS ARE REAL IMPLEMENTATIONS, NOT NO-OPS
// Deliberately. A stub `Assert.IsTrue` that returns without checking anything is
// the defect this repository already found once in the UnityEngine shim: the
// compile gate was satisfied by code that could not work, and a passing check
// meant nothing. These throw. That does not make them equivalent to NUnit - the
// message formats, the comparer semantics and the constraint syntax all differ -
// and nothing here is ever REPORTED as a test result. Its only job is to make the
// test code compile, and to fail loudly if someone later wires it into a run and
// expects it to behave exactly like NUnit.
//
// WHAT IS DELIBERATELY ABSENT
// Constraints (`Is.EqualTo(...)`), `TestCase`, `TestCaseSource`, `Values`,
// `Assert.Multiple`, `Assert.Ignore`, `Assert.Pass`, `Assume`, `TestCaseData`.
// None appear in the EditMode tests, and adding them "just in case" would grow a
// second framework to maintain that nothing depends on. If a test needs one of
// them, this file must grow with it - and the Editor gate is what runs them for
// real, so the shim never becomes the authority on whether they pass.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NUnit.Framework
{
    [AttributeUsage(AttributeTargets.Class)]
    public class TestFixtureAttribute : Attribute
    {
        public TestFixtureAttribute() { }
        public TestFixtureAttribute(params object[] arguments) { }
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class TestAttribute : Attribute
    {
        public TestAttribute() { }
        public TestAttribute(string description) { }
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class SetUpAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public class TearDownAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public class OneTimeSetUpAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public class OneTimeTearDownAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public class CategoryAttribute : Attribute
    {
        public CategoryAttribute(string name) { }
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class IgnoreAttribute : Attribute
    {
        public IgnoreAttribute(string reason) { }
    }

    /// <summary>NUnit's `TestDelegate`, which `Assert.Throws` takes.</summary>
    public delegate void TestDelegate();

    /// <summary>Thrown by every failed assertion. Distinct from a test failure of
    /// the code under test, which is why it is not one of the framework exceptions.</summary>
    public class AssertionException : Exception
    {
        public AssertionException(string message) : base(message) { }
    }

    public static class Assert
    {
        private static string With(string message) =>
            string.IsNullOrEmpty(message) ? "" : $" — {message}";

        private static void Report(bool condition, string message, string what)
        {
            if (!condition) throw new AssertionException($"Assert.{what} failed{With(message)}");
        }

        public static void IsTrue(bool condition, string message = null) =>
            Report(condition, message, "IsTrue");

        public static void IsFalse(bool condition, string message = null) =>
            Report(!condition, message, "IsFalse");

        public static void IsNull(object actual, string message = null) =>
            Report(actual == null, message, $"IsNull (was {Describe(actual)})");

        public static void IsNotNull(object actual, string message = null) =>
            Report(actual != null, message, "IsNotNull (was null)");

        public static void IsEmpty(string actual, string message = null) =>
            Report(string.IsNullOrEmpty(actual), message, $"IsEmpty (was \"{actual}\")");

        public static void IsNotEmpty(string actual, string message = null) =>
            Report(!string.IsNullOrEmpty(actual), message, "IsNotEmpty (was empty)");

        public static void AreEqual(object expected, object actual, string message = null) =>
            Report(ValuesMatch(expected, actual), message,
                $"AreEqual (expected {Describe(expected)}, was {Describe(actual)})");

        public static void AreNotEqual(object expected, object actual, string message = null) =>
            Report(!ValuesMatch(expected, actual), message,
                $"AreNotEqual (both were {Describe(actual)})");

        public static void IsInstanceOf<T>(object actual, string message = null) =>
            Report(actual is T, message, $"IsInstanceOf<{typeof(T).Name}> (was {Describe(actual)})");

        public static void Greater<T>(T actual, T expected, string message = null) where T : IComparable<T> =>
            Report(actual.CompareTo(expected) > 0, message, $"Greater (expected > {expected}, was {actual})");

        public static void GreaterOrEqual<T>(T actual, T expected, string message = null) where T : IComparable<T> =>
            Report(actual.CompareTo(expected) >= 0, message, $"GreaterOrEqual (expected >= {expected}, was {actual})");

        public static void Less<T>(T actual, T expected, string message = null) where T : IComparable<T> =>
            Report(actual.CompareTo(expected) < 0, message, $"Less (expected < {expected}, was {actual})");

        public static void LessOrEqual<T>(T actual, T expected, string message = null) where T : IComparable<T> =>
            Report(actual.CompareTo(expected) <= 0, message, $"LessOrEqual (expected <= {expected}, was {actual})");

        public static void Fail(string message = null) => throw new AssertionException($"Assert.Fail{With(message)}");

        /// <summary>
        /// NUnit's `Assert.Throws&lt;T&gt;`. Returns the exception so a caller can
        /// assert on its message, which is how NUnit's signature reads.
        /// </summary>
        public static T Throws<T>(TestDelegate code, string message = null) where T : Exception
        {
            try
            {
                code();
            }
            catch (T expected)
            {
                return expected;
            }
            catch (Exception other)
            {
                throw new AssertionException(
                    $"Assert.Throws<{typeof(T).Name}> saw {other.GetType().Name} instead{With(message)}");
            }
            throw new AssertionException($"Assert.Throws<{typeof(T).Name}> saw nothing thrown{With(message)}");
        }

        private static bool ValuesMatch(object expected, object actual)
        {
            if (expected == null && actual == null) return true;
            if (expected == null || actual == null) return false;
            // Numeric comparison across boxed types, because the tests compare an
            // int literal against bytes and longs the way NUnit allows.
            if (IsNumeric(expected) && IsNumeric(actual))
            {
                return Convert.ToDecimal(expected) == Convert.ToDecimal(actual);
            }
            return expected.Equals(actual);
        }

        private static bool IsNumeric(object value) =>
            value is byte || value is sbyte || value is short || value is ushort
            || value is int || value is uint || value is long || value is ulong
            || value is float || value is double || value is decimal;

        internal static string Describe(object value) =>
            value == null ? "null" : $"\"{value}\" ({value.GetType().Name})";
    }

    public static class CollectionAssert
    {
        private static List<object> Materialise(IEnumerable source)
        {
            var list = new List<object>();
            foreach (var item in source) list.Add(item);
            return list;
        }

        public static void AreEqual(IEnumerable expected, IEnumerable actual, string message = null)
        {
            var left = Materialise(expected);
            var right = Materialise(actual);
            if (left.Count != right.Count)
            {
                throw new AssertionException(
                    $"CollectionAssert.AreEqual failed: {left.Count} expected vs {right.Count} actual");
            }
            for (int i = 0; i < left.Count; i++)
            {
                if (left[i] == null ? right[i] != null : !left[i].Equals(right[i]))
                {
                    throw new AssertionException(
                        $"CollectionAssert.AreEqual failed at index {i}: expected {Assert.Describe(left[i])}, was {Assert.Describe(right[i])}");
                }
            }
        }

        public static void AreEquivalent(IEnumerable expected, IEnumerable actual, string message = null)
        {
            var left = Materialise(expected);
            var right = Materialise(actual);
            if (left.Count != right.Count)
            {
                throw new AssertionException(
                    $"CollectionAssert.AreEquivalent failed: {left.Count} expected vs {right.Count} actual");
            }
            var remaining = new List<object>(right);
            foreach (var item in left)
            {
                int at = remaining.IndexOf(item);
                if (at < 0)
                {
                    throw new AssertionException($"CollectionAssert.AreEquivalent failed: {Assert.Describe(item)} is missing");
                }
                remaining.RemoveAt(at);
            }
        }

        public static void Contains(IEnumerable collection, object expected, string message = null)
        {
            foreach (var item in collection)
            {
                if (item == null ? expected == null : item.Equals(expected)) return;
            }
            throw new AssertionException($"CollectionAssert.Contains failed: {Assert.Describe(expected)} is missing");
        }

        public static void DoesNotContain(IEnumerable collection, object expected, string message = null)
        {
            foreach (var item in collection)
            {
                if (item == null ? expected == null : item.Equals(expected))
                {
                    throw new AssertionException($"CollectionAssert.DoesNotContain failed: {Assert.Describe(expected)} is present");
                }
            }
        }
    }

    public static class StringAssert
    {
        public static void StartsWith(string expected, string actual, string message = null)
        {
            if (actual == null || !actual.StartsWith(expected, StringComparison.Ordinal))
            {
                throw new AssertionException($"StringAssert.StartsWith failed: expected \"{expected}\", was {Assert.Describe(actual)}");
            }
        }

        public static void Contains(string expected, string actual, string message = null)
        {
            if (actual == null || !actual.Contains(expected))
            {
                throw new AssertionException($"StringAssert.Contains failed: expected to find \"{expected}\" in {Assert.Describe(actual)}");
            }
        }

        public static void DoesNotContain(string expected, string actual, string message = null)
        {
            if (actual != null && actual.Contains(expected))
            {
                throw new AssertionException($"StringAssert.DoesNotContain failed: found \"{expected}\" in {Assert.Describe(actual)}");
            }
        }

        public static void IsMatch(string pattern, string actual, string message = null)
        {
            if (actual == null || !Regex.IsMatch(actual, pattern))
            {
                throw new AssertionException($"StringAssert.IsMatch failed: {Assert.Describe(actual)} does not match /{pattern}/");
            }
        }
    }
}
