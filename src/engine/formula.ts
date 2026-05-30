export interface EvalResult {
  value: number;
  breakdown: { step: string; result: number }[];
}

export function evaluate(formula: string, vars: Record<string, number>): EvalResult {
  const tokens = tokenize(formula);
  const ast = parse(tokens);
  const value = evalNode(ast, vars);
  return { value, breakdown: [] };
}

export function validate(formula: string): { ok: boolean; error?: string } {
  try {
    const tokens = tokenize(formula);
    parse(tokens, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function batchEvaluate(
  formulas: string[],
  vars: Record<string, number>,
): EvalResult[] {
  return formulas.map(f => evaluate(f, vars));
}

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  const c = (): string => s[i]!;

  while (i < s.length) {
    if (c() === " " || c() === "\t" || c() === "\n" || c() === "\r") {
      i++;
      continue;
    }

    if (c() === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (c() === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (c() === ",") { tokens.push({ type: "comma" }); i++; continue; }

    if (c() === "*" && i + 1 < s.length && s[i + 1] === "*") {
      tokens.push({ type: "op", value: "**" }); i += 2; continue;
    }

    if (c() === ">" && i + 1 < s.length && s[i + 1] === "=") {
      tokens.push({ type: "op", value: ">=" }); i += 2; continue;
    }
    if (c() === "<" && i + 1 < s.length && s[i + 1] === "=") {
      tokens.push({ type: "op", value: "<=" }); i += 2; continue;
    }
    if (c() === "=" && i + 1 < s.length && s[i + 1] === "=") {
      tokens.push({ type: "op", value: "==" }); i += 2; continue;
    }
    if (c() === "!" && i + 1 < s.length && s[i + 1] === "=") {
      tokens.push({ type: "op", value: "!=" }); i += 2; continue;
    }

    if (c() === "+" || c() === "-" || c() === "*" || c() === "/" || c() === ">" || c() === "<") {
      tokens.push({ type: "op", value: c() }); i++; continue;
    }

    if (c() >= "0" && c() <= "9" || c() === ".") {
      let num = "";
      while (i < s.length && (c() >= "0" && c() <= "9" || c() === ".")) {
        num += c(); i++;
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    if ((c() >= "a" && c() <= "z") || (c() >= "A" && c() <= "Z") || c() === "_") {
      let ident = "";
      while (i < s.length && ((c() >= "a" && c() <= "z") || (c() >= "A" && c() <= "Z") || c() === "_" || (c() >= "0" && c() <= "9"))) {
        ident += c(); i++;
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    throw new Error(`Unexpected character '${c()}' at position ${i}`);
  }

  return tokens;
}

type AstNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "binary"; op: string; left: AstNode; right: AstNode }
  | { type: "unary"; op: string; operand: AstNode }
  | { type: "call"; name: string; args: AstNode[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private strictFns: boolean) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("Unexpected end of expression");
    this.pos++;
    return t;
  }

  private expect(type: Token["type"], value?: string): Token {
    const t = this.advance();
    if (t.type !== type || (value !== undefined && ("value" in t) && t.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` '${value}'` : ""}, got ${t.type}`);
    }
    return t;
  }

  parse(): AstNode {
    const node = this.parseComparison();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at position ${this.pos}`);
    }
    return node;
  }

  private parseComparison(): AstNode {
    let left = this.parseAddSub();
    while (true) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === ">" || t.value === "<" || t.value === ">=" || t.value === "<=" || t.value === "==" || t.value === "!=")) {
        this.advance();
        left = { type: "binary", op: t.value, left, right: this.parseAddSub() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (true) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.advance();
        left = { type: "binary", op: t.value, left, right: this.parseMulDiv() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMulDiv(): AstNode {
    let left = this.parsePower();
    while (true) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.advance();
        left = { type: "binary", op: t.value, left, right: this.parsePower() };
      } else {
        break;
      }
    }
    return left;
  }

  private parsePower(): AstNode {
    let base = this.parseUnary();
    const t = this.peek();
    if (t && t.type === "op" && t.value === "**") {
      this.advance();
      return { type: "binary", op: "**", left: base, right: this.parsePower() };
    }
    return base;
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t && t.type === "op" && t.value === "-") {
      this.advance();
      return { type: "unary", op: "-", operand: this.parseUnary() };
    }
    if (t && t.type === "op" && t.value === "+") {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.type === "number") {
      this.advance();
      return { type: "number", value: t.value };
    }

    if (t.type === "lparen") {
      this.advance();
      const node = this.parseAddSub();
      this.expect("rparen");
      return node;
    }

    if (t.type === "ident") {
      this.advance();
      if (this.peek()?.type === "lparen") {
        this.advance();
        const args: AstNode[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseComparison());
          while (this.peek()?.type === "comma") {
            this.advance();
            args.push(this.parseComparison());
          }
        }
        this.expect("rparen");
        if (this.strictFns && !(t.value in BUILTINS)) {
          throw new Error(`Unknown function: ${t.value}`);
        }
        return { type: "call", name: t.value, args };
      }
      return { type: "variable", name: t.value };
    }

    throw new Error(`Unexpected token: ${t.type}`);
  }
}

function parse(tokens: Token[], strictFns = false): AstNode {
  return new Parser(tokens, strictFns).parse();
}

const BUILTINS: Record<string, (...args: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  abs: (v) => Math.abs(v),
  floor: (v) => Math.floor(v),
  ceil: (v) => Math.ceil(v),
  round: (v) => Math.round(v),
  rand: (lo, hi) => lo + Math.random() * (hi - lo),
  if: (cond, then, els) => cond ? then : els,
};

function evalNode(node: AstNode, vars: Record<string, number>): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "variable": {
      if (!(node.name in vars)) {
        throw new Error(`Undefined variable: ${node.name}`);
      }
      return vars[node.name]!;
    }
    case "unary":
      if (node.op === "-") return -evalNode(node.operand, vars);
      return evalNode(node.operand, vars);
    case "binary": {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "**": return l ** r;
        case ">": return l > r ? 1 : 0;
        case "<": return l < r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case "==": return l === r ? 1 : 0;
        case "!=": return l !== r ? 1 : 0;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }
    case "call": {
      const fn = BUILTINS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      return fn(...node.args.map(a => evalNode(a, vars)));
    }
  }
}
