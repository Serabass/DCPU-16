/*
 *  DCPU-16 Assembler & Emulator Library
 *  by deNULL (me@denull.ru)
 */

var Assembler = {
  REGISTERS: [ "a", "b", "c", "x", "y", "z", "i", "j" ],
  SPECIALS: [ "pop", "peek", "push", "sp", "pc", "o" ],
  BINARY: { '*': 2, '/': 2, '%': 2, '+': 1, '-': 1 },

  OP_BINARY: [ "set", "add", "sub", "mul", "div", "mod", "shl", "shr",
               "and", "bor", "xor", "ife", "ifn", "ifg", "ifb" ],
  OP_SPECIAL: [ "jsr" ],

  /*
   * parser state is passed around in a "state" object:
   *   - text: line of text
   *   - pos: current index into text
   *   - end: parsing should not continue past end
   *   - logger: function(pos, message, fatal) for reporting errors
   * index & offset are only tracked so they can be passed to logger for error reporting.
   */

  /**
   * parse a single atom and return either: literal, register, or label
   */
  parseAtom: function(state) {
    var text = state.text;
    var pos = state.pos;
    var end = state.end;
    var logger = state.logger;

    while (pos < end && text.charAt(pos).match(/\s/)) pos++;
    if (pos == end) {
      logger(pos, "Value expected (operand or expression)", true);
      return false;
    }

    var atom = { loc: pos };

    if (text.charAt(pos) == '(') {
      state.pos = pos + 1;
      atom = this.parseExpression(state, 0);
      if (!atom) return false;
      pos = atom.state.pos;
      while (pos < end && text.charAt(pos).match(/\s/)) pos++;
      if (pos == end || text.charAt(pos) != ')') {
        logger(pos, "Missing ) on expression", true);
        return false;
      }
      atom.state.pos = pos + 1;
    } else {
      var operand = text.substr(pos, end - pos).match(/^[A-Za-z_.0-9]+/);
      if (!operand) {
        logger(pos, "Operand value expected", true);
        return false;
      }
      operand = operand[0].toLowerCase();
      pos += operand.length;
      if (operand.match(/^[0-9]+$/g)) {
        atom.literal = parseInt(operand, 10);
      } else if (operand.match(/^0x[0-9a-fA-F]+$/g)) {
        atom.literal = parseInt(operand, 16);
      } else if (this.REGISTERS.indexOf(operand) > -1) {
        atom.register = this.REGISTERS.indexOf(operand);
      } else if (operand.match(/^[a-zA-Z_.][a-zA-Z_.0-9]*$/)) {
        atom.label = operand;
      }
      atom.state = { text: text, pos: pos, end: end, logger: logger };
    }
    return atom;
  },

  parseUnary: function(state) {
    if (state.pos < state.end &&
        (state.text.charAt(state.pos) == '-' || state.text.charAt(state.pos) == '+')) {
      var loc = state.pos;
      var op = state.text.charAt(state.pos);
      state.pos++;
      var expr = this.parseAtom(state);
      if (!expr) return false;
      return { unary: op, right: expr, state: expr.state, loc: loc };
    } else {
      return this.parseAtom(state);
    }
  },

  /**
   * Parse an expression and return a parse tree. The parse tree nodes will contain one of:
   *   - binary (left, right)
   *   - unary (right)
   *   - literal
   *   - register
   *   - label
   */
  parseExpression: function(state, precedence) {
    var text = state.text;
    var pos = state.pos;
    var end = state.end;
    var logger = state.logger;

    while (pos < end && text.charAt(pos).match(/\s/)) pos++;
    if (pos == end) {
      logger(pos, "Expression expected", true);
      return false;
    }
    var left = this.parseUnary(state);
    if (!left) return false;
    pos = left.state.pos;

    while (true) {
      while (pos < end && text.charAt(pos).match(/\s/)) pos++;
      if (pos == end || text.charAt(pos) == ')') return left;

      var newprec = this.BINARY[text.charAt(pos)];
      if (newprec === undefined) {
        logger(pos, "Unknown operator (try: + - * / %)", true);
        return false;
      }
      if (newprec <= precedence) return left;
      var op = text.charAt(pos);
      var loc = pos;
      state.pos = pos + 1;
      var right = this.parseExpression(state, newprec);
      if (!right) return false;
      left = { binary: op, left: left, right: right, state: right.state, loc: loc };
      pos = left.state.pos;
    }
  },

  /**
   * Convert an expression tree from 'parseExpression' into a human-friendly string form, for
   * debugging.
   */
  expressionToString: function(expr) {
    if (expr.literal !== undefined) {
      return expr.literal.toString();
    } else if (expr.label !== undefined) {
      return expr.label;
    } else if (expr.register !== undefined) {
      return this.REGISTERS[expr.register];
    } else if (expr.unary !== undefined) {
      return "(" + expr.unary + this.expressionToString(expr.right) + ")";
    } else if (expr.binary !== undefined) {
      return "(" + this.expressionToString(expr.left) + " " + expr.binary + " " +
        this.expressionToString(expr.right) + ")";
    } else {
      return "ERROR";
    }
  },

  /**
   * Given a parsed expression tree, evaluate into a literal number.
   * Label references are looked up in 'labels'. Any register reference, or reference to a label
   * that's not in 'labels' will be an error.
   */
  evalConstant: function(expr, labels, fatal) {
    var logger = expr.state.logger;
    var pos = expr.state.pos;
    var value;
    if (expr.literal !== undefined) {
      value = expr.literal;
    } else if (expr.label !== undefined) {
      if (this.SPECIALS.indexOf(expr.label) > -1) {
        logger(pos, "You can't use " + expr.label.toUpperCase() + " in expressions.", true);
        return false;
      }
      value = labels[expr.label];
      if (value === undefined) {
        if (fatal) logger(expr.loc, "Unresolvable reference to '" + expr.label + "'", true);
        return false;
      }
    } else if (expr.register !== undefined) {
      logger(expr.loc, "Constant expressions may not contain register references", true);
      return false;
    } else if (expr.unary !== undefined) {
      value = this.evalConstant(expr.right, labels, fatal);
      if (!value) return false;
      switch (expr.unary) {
        case '-': { value = -value; break; }
        default: break;
      }
    } else if (expr.binary !== undefined) {
      var left = this.evalConstant(expr.left, labels, fatal);
      if (left === false) return false;
      var right = this.evalConstant(expr.right, labels, fatal);
      if (right === false) return false;
      switch (expr.binary) {
        case '+': { value = left + right; break; }
        case '-': { value = left - right; break; }
        case '*': { value = left * right; break; }
        case '/': { value = left / right; break; }
        case '%': { value = left % right; break; }
        default: {
          logger(expr.loc, "Internal error (undefined binary operator)", true);
          return false;
        }
      }
    } else {
      logger(expr.loc, "Internal error (undefined expression type)", true);
      return false;
    }
    if (value < 0 || value > 0xffff) {
      logger(pos, "(Warning) Literal value " + value.toString(16) + " will be truncated to " + (value & 0xffff).toString(16));
      value = value & 0xffff;
    }
    return value;
  },

  /**
   * Parse any constant in this line and place it into the labels map if we found one.
   * Returns true if this line did contain some constant definition (even if it was an error),
   * meaning you shouldn't bother compiling this line.
   */
  parseConstant: function(text, labels, logger) {
    var match = text.match(/^\s*([A-Za-z_.][A-Za-z0-9_.]*)\s*=\s*(\S+)/);
    if (!match) return false;
    var name = match[1].toLowerCase();
    if (this.REGISTERS[name] !== undefined || this.SPECIALS[name] !== undefined) {
      logger(0, name + " is a reserved word and can't be used as a constant.", true);
      return true;
    }
    if (labels[name]) logger(0, "Duplicate label \"" + name + "\"");

    // manually find position of expression, for displaying nice error messages.
    var pos = text.indexOf('=') + 1;
    while (text.charAt(pos).match(/\s/)) pos++;
    var state = { text: text, pos: pos, end: text.length, logger: logger };
    var expr = this.parseExpression(state, 0);
    if (expr) {
      var value = this.evalConstant(expr, labels, true);
      if (value) labels[name] = value;
    }
    return true;
  },

  /*
   * Parse a line of code.
   * Returns the parsed line:
   *   - label (if any)
   *   - op (if any)
   *   - args (array): any operands, in text form
   *   - arg_locs (array): positions of the operands within the text
   *   - arg_ends (array): positions of the end of operands within the text
   */
  parseLine: function(text, logger) {
    var pos = 0;
    var end = text.length;
    var line = { text: text, pos: pos, end: end };

    while (pos < end && text.charAt(pos).match(/\s/)) pos++;
    if (pos == end) return line;

    if (text.charAt(pos) == ":") {
      // label
      pos++;
      line.label = text.substr(pos, end - pos).match(/^[a-z_.][a-z_.0-9]*/);
      if (!line.label || line.label[0].length == 0) {
        logger(pos, "Label name must contain only latin characters, underscore, dot or digits.", true);
        return false;
      }
      line.label = line.label[0].toLowerCase();
      pos += line.label.length;
    }

    while (pos < end && text.charAt(pos).match(/\s/)) pos++;
    if (pos == end) return line;
    if (text.charAt(pos) == ';') return line;

    var word = text.substr(pos, end - pos).match(/[A-Za-z]+/);
    if (!word) {
      logger(pos, "Inscrutable opcode", true);
      return false;
    }
    line.op = word[0].toLowerCase();
    pos += line.op.length;

    var args = [ "" ];
    var arg_locs = [ -1 ];
    var arg_ends = [ -1 ];
    var n = 0;
    in_string = false;
    for (var i = pos; i < end; i++) {
      if (text.charAt(i) == '\\' && i + 1 < end) {
        if (arg_locs[n] == -1) arg_locs[n] = i;
        args[n] += text.charAt(i);
      } else if (text.charAt(i) == '"') {
        in_string = !in_string;
        args[n] += text.charAt(i);
      } else if (text.charAt(i) == ',' && !in_string) {
        arg_ends[n] = i;
        args.push("");
        arg_locs.push(-1);
        arg_ends.push(-1);
        n += 1;
      } else if (text.charAt(i) == ';' && !in_string) {
        break;
      } else if (in_string || text.charAt(i) != ' ') {
        if (arg_locs[n] == -1) arg_locs[n] = i;
        args[n] += text.charAt(i);
      }
    }
    arg_ends[n] = i;
    if (in_string) {
      logger(pos, "Expected '\"' before end of line", true);
      return false;
    }
    line.args = args;
    line.arg_locs = arg_locs;
    line.arg_ends = arg_ends;
    return line;
  },

  unquoteString: function(s) {
    var rv = "";
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) == '\\' && i < s.length - 1) {
        i += 1;
        switch (s.charAt(i)) {
          case 'n': { rv += "\n"; break; }
          case 'r': { rv += "\r"; break; }
          case 't': { rv += "\t"; break; }
          case 'x': {
            if (i < s.length - 2) {
              rv += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16));
              i += 2;
            } else {
              rv += "\\x";
            }
            break;
          }
          default: { rv += "\\" + s.charAt(i); break; }
        }
      } else {
        rv += s.charAt(i);
      }
    }
    return rv;
  },

  stateFromArg: function(line, i, logger) {
    return { text: line.text, pos: line.arg_locs[i], end: line.arg_ends[i], logger: logger };
  },

  handleData: function(info, line, labels, logger) {
    var args = line.args;
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg.length == 0) continue;
      if (arg.charAt(0) == '"') {
        arg = this.unquoteString(arg.substr(1, arg.length - 2));
        for (var j = 0; j < arg.length; j++) {
          info.size++;
          info.dump.push(arg.charCodeAt(j));
        }
      } else {
        var expr = this.parseExpression(this.stateFromArg(line, i, logger), 0);
        if (!expr) return false;
        var value = this.evalConstant(expr, labels, true);
        if (!value) return false;
        info.size++;
        info.dump.push(value);
      }
    }
    return info;
  },

  /**
   * Parse an operand expression into:
   *   - code: 5-bit value for the operand in an opcode
   *   - immediate: (optional) if the opcode has an immediate word attached
   *   - expr: if the operand expression can't be evaluated yet (needs to wait for the 2nd pass)
   * If 'short' is set in state, then the operand must fit into the opcode.
   */
  parseOperand: function(state, labels) {
    var text = state.text;
    var pos = state.pos;
    var end = state.end;
    var info = { };

    var pointer = false;
    if (state.text.charAt(state.pos) == '[') {
      if (state.pos + 2 >= state.end || state.text.charAt(state.end - 1) != ']') {
        logger(state.pos, "Missing ']'", true);
        return false;
      }
      pointer = true;
      state.pos++;
      state.end--;
    }

    var expr = this.parseExpression(state);
    if (!expr) return false;

    // simple cases: register, special mode
    if (expr.register !== undefined) {
      info.code = (pointer ? 0x08 : 0x00) + expr.register;
      return info;
    }
    if (expr.label !== undefined && this.SPECIALS.indexOf(expr.label) >= 0  ) {
      if (pointer) {
        logger(state.pos, "You can't use a pointer to " + expr.label, true);
        return false;
      }
      info.code = 0x18 + this.SPECIALS.indexOf(expr.label);
      return info;
    }

    // special case: [literal + register]
    if (pointer && expr.binary !== undefined &&
        (expr.left.register !== undefined || expr.right.register !== undefined)) {
      if (expr.binary != '+') {
        logger(state.pos, "Only a sum of a value + register is allowed");
        return false;
      }
      if (expr.left.register !== undefined) {
        // switch the register to the right side
        var swap = expr.left;
        expr.left = expr.right;
        expr.right = swap;
      }
      info.code = 0x10 + expr.right.register;
      var address = this.evalConstant(expr.left, labels, false);
      if (address !== false) {
        info.immediate = address;
      } else {
        info.immediate = 0;
        info.expr = expr.left;
      }
      return info;
    }

    // try resolving the expression if we can
    var value = state.delay_eval ? false : this.evalConstant(expr, labels, false);
    if (value !== false) {
      if (!pointer && value < 32) {
        info.code = 0x20 + value;
      } else {
        info.code = (pointer ? 0x1e : 0x1f);
        info.immediate = value;
      }
    } else {
      // save it for the second pass.
      if (state.short) {
        info.code = 0;
        info.short = true;
        info.expr = expr;
      } else {
        info.code = (pointer ? 0x1e : 0x1f);
        info.immediate = 0;
        info.expr = expr;
      }
    }
    return info;
  },

  /**
   * Called during the 2nd pass: resolve any unresolved expressions, or blow up.
   */
  resolveOperand: function(info, labels, logger) {
    var value = this.evalConstant(info.expr, labels, true);
    if (value === false) return false;
    if (info.short) {
      if (value >= 32) {
        logger(0, "Operand must be < 32", true);
        return false;
      }
      info.code = 0x20 + value;
    } else {
      info.immediate = value;
    }
    info.expr = undefined;
    return info;
  },

  /*
   * Compile a line of code. If either operand can't be resolved yet, it will have an 'expr' field.
   * The size will already be computed in any case.
   *
   * Returns object with fields:
   *   op, size, dump (array of words), a, b
   */
  compileLine: function(text, org, labels, logger) {
    var line = this.parseLine(text, logger);
    if (!line) return false;
    if (line.label) labels[line.label] = org;
    var info = { op: line.op, size: 0, dump: [] };
    if (info.op === undefined) return info;

    if (info.op == "dat") {
      return this.handleData(info, line, labels, logger);
    }
    if (info.op == "org") {
      if (line.args.length != 1) {
        logger(0, "ORG requires a single value", true);
        return false;
      }
      var expr = this.parseExpression(this.stateFromArg(line, 0, logger), 0);
      if (!expr) return false;
      var value = this.evalConstant(expr, labels, true);
      if (!value) return false;
      info.org = value;
      if (line.label) labels[line.label] = org;
      return info;
    }

    // common aliases
    if (info.op == "jmp" && line.args.length == 1) {
      info.op = "set";
      // sneaky: overwrite the "jmp" with "pc" so it can be parsed out later.
      line.text = "pc " + line.text.substr(3);
      line.args.push("pc");
      line.arg_locs.push(0);
      line.arg_ends.push(2);
      return this.compileLine("set pc, " + line.args[0], org, labels, logger);
    } else if (info.op == "brk") {
      return this.compileLine("sub pc, 1", org, labels, logger);
    } else if (info.op == "ret") {
      return this.compileLine("set pc, pop", org, labels, logger);
    }

    var opcode, a, b;
    var i = this.OP_BINARY.indexOf(info.op);
    if (i >= 0) {
      if (line.args.length != 2) {
        logger(0, "Basic instruction " + info.op + " requires 2 values", true);
        return false;
      }
      opcode = i + 1;
      b = this.parseOperand(this.stateFromArg(line, 1, logger), labels);
      a = this.parseOperand(this.stateFromArg(line, 0, logger), labels);
    } else {
      i = this.OP_SPECIAL.indexOf(info.op);
      if (i >= 0) {
        if (line.args.length != 1) {
          logger(0, "Non-basic instruction " + info.op + " requires 1 value", true);
          return false;
        }
        opcode = 0;
        b = this.parseOperand(this.stateFromArg(line, 0, logger), labels);
        a = { code: i + 1 };
      } else {
        if (info.op == "bra") {
          var state = this.stateFromArg(line, 0, logger);
          state.short = true;
          state.delay_eval = true;
          opcode = 0;
          b = this.parseOperand(state, labels);
          if (!b) return false;
          a = { code: 0x18 + this.SPECIALS.indexOf("pc") };
          // we'll compute the branch on the 2nd pass.
          info.branch_from = org + 1;
        } else {
          logger(0, "Unknown instruction: " + info.op, true);
          return false;
        }
      }
    }

    if (!a || !b) return false;
    info.size = 1 + (a.immediate !== undefined ? 1 : 0) + (b.immediate !== undefined ? 1 : 0);
    info.dump.push(opcode | (a.code << 4) | (b.code << 10));
    if (a.immediate !== undefined) info.dump.push(a.immediate);
    if (b.immediate !== undefined) info.dump.push(b.immediate);
    info.a = a;
    info.b = b;
    return info;
  },

  resolveLine: function(info, labels, logger) {
    var index = 1;
    if (info.branch_from) {
      // finally resolve relative branch
      info.b.short = false;
      var dest = this.resolveOperand(info.b, labels, logger);
      if (!dest) return false;
      var offset = info.branch_from - dest.immediate;
      if (offset < -31 || offset > 31) {
        logger(0, "Branch can't move this far away (limit: 31 words)", true);
        return false;
      }
      if (offset < 0) {
        opcode = this.OP_BINARY.indexOf("add") + 1;
        offset = -offset;
      } else {
        opcode = this.OP_BINARY.indexOf("sub") + 1;
      }
      info.dump[0] = opcode | (info.a.code << 4) | ((offset | 0x20) << 10);
      return info;
    }
    if (info.a !== undefined && info.a.expr !== undefined) {
      var a = this.resolveOperand(info.a, labels, logger);
      if (!a) return false;
      info.a = a;
      if (!info.a.short) info.dump[index++] = a.immediate;
    }
    if (info.b !== undefined && info.b.expr !== undefined) {
      var b = this.resolveOperand(info.b, labels, logger);
      if (!b) return false;
      info.b = b;
      if (!info.b.short) info.dump[index++] = b.immediate;
    }
    return info;
  },

  /**
   * Compile a list of lines of code.
   *   - lines: array of strings, lines of DCPU assembly to compile
   *   - memory: array of DCPU memory to fill in with compiled code
   *   - logger: (line#, address, line_pos, text, fatal) function to collect warnings/errors
   * If successful, returns:
   *   - infos: opcode info per line
   */
  compile: function(lines, memory, logger) {
    var labels = { };
    var aborted = false;
    var pc = 0;
    var infos = [ ];

    for (var i = 0; i < lines.length && !aborted; i++) {
      var l_logger = function(pos, text, fatal) {
        logger(i, pc, pos, text, fatal);
        if (fatal) aborted = true;
      };
      labels["."] = pc;
      if (!this.parseConstant(lines[i], labels, l_logger)) {
        var info = this.compileLine(lines[i], pc, labels, l_logger);
        if (!info) break;
        if (pc + info.size > 0xffff) {
          l_logger(0, "Code is too big (exceeds 128 KB) -- not enough memory", true);
          break;
        } else if (pc + info.size > 0x8000) {
          l_logger(0, "Code is too big (exceeds 64 KB) -- overlaps video memory");
        }
        if (info.org !== undefined) {
          pc = info.org;
          info.pc = pc;
        } else {
          info.pc = pc;
          pc += info.size;
        }
        infos[i] = info;
      }
    }
    if (aborted) return false;

    // second pass -- resolve any leftover addresses:
    for (var i = 0; i < lines.length && !aborted; i++) {
      if (infos[i] === undefined) continue;
      var l_logger = function(pos, text, fatal) {
        logger(i, pc, pos, text, fatal);
        if (fatal) aborted = true;
      };
      infos[i] = this.resolveLine(infos[i], labels, l_logger);
      if (!infos[i]) break;
      for (var j = 0; j < infos[i].dump.length; j++) {
        memory[infos[i].pc + j] = infos[i].dump[j];
      }
    }
    if (aborted) return false;

    return { infos: infos };
  },
}
