import { describe, expect, it } from "vitest";
import { evaluate, validate, batchEvaluate } from "../formula.js";

describe("evaluate — basic arithmetic", () => {
  it("adds two numbers", () => {
    expect(evaluate("2 + 3", {}).value).toBe(5);
  });

  it("subtracts two numbers", () => {
    expect(evaluate("10 - 4", {}).value).toBe(6);
  });

  it("handles negative results", () => {
    expect(evaluate("3 - 10", {}).value).toBe(-7);
  });

  it("chains addition and subtraction", () => {
    expect(evaluate("1 + 2 + 3 - 4", {}).value).toBe(2);
  });

  it("handles whitespace variations", () => {
    expect(evaluate("  2  +  3  ", {}).value).toBe(5);
  });

  it("handles no spaces", () => {
    expect(evaluate("2+3", {}).value).toBe(5);
  });
});

describe("evaluate — operator precedence", () => {
  it("multiplication before addition", () => {
    expect(evaluate("2 + 3 * 4", {}).value).toBe(14);
  });

  it("division before subtraction", () => {
    expect(evaluate("10 - 6 / 2", {}).value).toBe(7);
  });

  it("parentheses override precedence", () => {
    expect(evaluate("(2 + 3) * 4", {}).value).toBe(20);
  });

  it("nested parentheses", () => {
    expect(evaluate("((1 + 2) * (3 + 4))", {}).value).toBe(21);
  });

  it("multiplication and division left to right", () => {
    expect(evaluate("12 / 3 * 2", {}).value).toBe(8);
  });

  it("power operator", () => {
    expect(evaluate("2 ** 10", {}).value).toBe(1024);
  });

  it("power is right-associative", () => {
    expect(evaluate("2 ** 3 ** 2", {}).value).toBe(512);
  });

  it("power has highest precedence", () => {
    expect(evaluate("1 + 2 ** 3", {}).value).toBe(9);
  });

  it("unary negation", () => {
    expect(evaluate("-5 + 3", {}).value).toBe(-2);
  });

  it("double negation", () => {
    expect(evaluate("--5", {}).value).toBe(5);
  });
});

describe("evaluate — variable substitution", () => {
  it("single variable", () => {
    expect(evaluate("x", { x: 42 }).value).toBe(42);
  });

  it("variable in expression", () => {
    expect(evaluate("a * b + c", { a: 2, b: 3, c: 1 }).value).toBe(7);
  });

  it("variable with underscore", () => {
    expect(evaluate("skill_base + 1", { skill_base: 100 }).value).toBe(101);
  });

  it("throws on undefined variable", () => {
    expect(() => evaluate("x + 1", {})).toThrow(/undefined variable/i);
  });
});

describe("evaluate — built-in functions", () => {
  it("max(a, b)", () => {
    expect(evaluate("max(3, 5)", {}).value).toBe(5);
  });

  it("min(a, b)", () => {
    expect(evaluate("min(3, 5)", {}).value).toBe(3);
  });

  it("clamp(low)", () => {
    expect(evaluate("clamp(x, 0, 100)", { x: -5 }).value).toBe(0);
  });

  it("clamp(high)", () => {
    expect(evaluate("clamp(x, 0, 100)", { x: 200 }).value).toBe(100);
  });

  it("clamp(in range)", () => {
    expect(evaluate("clamp(x, 0, 100)", { x: 50 }).value).toBe(50);
  });

  it("abs", () => {
    expect(evaluate("abs(-7)", {}).value).toBe(7);
  });

  it("floor", () => {
    expect(evaluate("floor(3.7)", {}).value).toBe(3);
  });

  it("ceil", () => {
    expect(evaluate("ceil(3.2)", {}).value).toBe(4);
  });

  it("round", () => {
    expect(evaluate("round(3.5)", {}).value).toBe(4);
    expect(evaluate("round(3.4)", {}).value).toBe(3);
  });

  it("nested function calls", () => {
    expect(evaluate("max(min(a, 10), 5)", { a: 3 }).value).toBe(5);
  });

  it("function with expression args", () => {
    expect(evaluate("max(1 + 2, 2 + 2)", {}).value).toBe(4);
  });
});

describe("evaluate — conditional if()", () => {
  it("true branch", () => {
    expect(evaluate("if(1, 10, 20)", {}).value).toBe(10);
  });

  it("false branch", () => {
    expect(evaluate("if(0, 10, 20)", {}).value).toBe(20);
  });

  it("with comparison-like logic via subtraction", () => {
    expect(evaluate("if(a - b, 100, 200)", { a: 5, b: 5 }).value).toBe(200);
  });

  it("with expression branches", () => {
    expect(evaluate("if(1, 2 * 3, 4 * 5)", {}).value).toBe(6);
  });
});

describe("evaluate — rand()", () => {
  it("produces values in range", () => {
    for (let i = 0; i < 50; i++) {
      const v = evaluate("rand(10, 20)", {}).value;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("clamp(rand(...), lo, hi) stays bounded", () => {
    for (let i = 0; i < 50; i++) {
      const v = evaluate("clamp(x + rand(-5, 5), 0, 100)", { x: 50 }).value;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("evaluate — error handling", () => {
  it("division by zero returns Infinity", () => {
    expect(evaluate("1 / 0", {}).value).toBe(Infinity);
  });

  it("empty string throws", () => {
    expect(() => evaluate("", {})).toThrow();
  });

  it("unclosed parenthesis throws", () => {
    expect(() => evaluate("(1 + 2", {})).toThrow();
  });

  it("unknown function throws", () => {
    expect(() => evaluate("foo(1)", {})).toThrow(/unknown function/i);
  });

  it("syntax error throws", () => {
    expect(() => evaluate("1 + * 2", {})).toThrow();
  });

  it("trailing operator throws", () => {
    expect(() => evaluate("1 +", {})).toThrow();
  });

  it("unexpected character throws", () => {
    expect(() => evaluate("1 @ 2", {})).toThrow(/unexpected character/i);
  });
});

describe("validate", () => {
  it("valid formula", () => {
    expect(validate("a + b * c")).toEqual({ ok: true });
  });

  it("valid with function", () => {
    expect(validate("max(a, b)")).toEqual({ ok: true });
  });

  it("syntax error", () => {
    const r = validate("a + * b");
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("unclosed paren", () => {
    const r = validate("(a + b");
    expect(r.ok).toBe(false);
  });

  it("empty string", () => {
    const r = validate("");
    expect(r.ok).toBe(false);
  });

  it("unknown function", () => {
    const r = validate("foo(a)");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown function/i);
  });

  it("valid complex formula with comparison", () => {
    expect(validate("if(a > 0, a * b, 0)").ok).toBe(true);
  });
});

describe("batchEvaluate", () => {
  it("multiple formulas shared vars", () => {
    const results = batchEvaluate(
      ["a + b", "a * b", "a - b"],
      { a: 10, b: 3 },
    );
    expect(results.map(r => r.value)).toEqual([13, 30, 7]);
  });

  it("preserves breakdown for each", () => {
    const results = batchEvaluate(["1 + 2"], {});
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(3);
  });
});

describe("evaluate — real-world formulas", () => {
  it("damage formula", () => {
    const r = evaluate(
      "skill_base * path_mult * hit_mod * (1 - target_resist)",
      { skill_base: 1000, path_mult: 1.5, hit_mod: 1.0, target_resist: 0.3 },
    );
    expect(r.value).toBeCloseTo(1050);
  });

  it("growth formula", () => {
    const r = evaluate(
      "base_hp * stage_mult * race_mult",
      { base_hp: 100, stage_mult: 2.5, race_mult: 1.2 },
    );
    expect(r.value).toBeCloseTo(300);
  });

  it("tribulation survival via if + comparison", () => {
    const r = evaluate(
      "if(spirit_power > 800, 0.73, 0.3)",
      { spirit_power: 1200 },
    );
    expect(r.value).toBeCloseTo(0.73);
  });

  it("tribulation survival — low spirit", () => {
    const r = evaluate(
      "if(spirit_power > 800, 0.73, 0.3)",
      { spirit_power: 500 },
    );
    expect(r.value).toBeCloseTo(0.3);
  });

  it("clamped damage with variance", () => {
    for (let i = 0; i < 20; i++) {
      const r = evaluate(
        "clamp(base + rand(-variance, variance), 0, max_val)",
        { base: 1000, variance: 200, max_val: 1500 },
      );
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(1500);
    }
  });
});
