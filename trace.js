const slasm = require(require('path').join(process.env.SLASM_LIB || '/home/claude/slasm/lib', 'interpreter')).default;
const evaluate = require(require('path').join(process.env.SLASM_LIB || '/home/claude/slasm/lib', 'interpreter/evaluate.js')).default;
const { createRuntime } = require(require('path').join(process.env.SLASM_LIB || '/home/claude/slasm/lib', 'interpreter/vm.js'));
const runInstruction = require(require('path').join(process.env.SLASM_LIB || '/home/claude/slasm/lib', 'interpreter/runinstruction/index.js')).default;
const fs = require('fs');

async function trace(src, inputQueue = null, maxSteps = 1e6) {
  const [ins, labels] = slasm.compile(src);
  const rt = createRuntime(ins, labels, { emit() {} }, inputQueue);
  const writes = [];
  const clears = [];
  const seen = new Set();
  let steps = 0;
  while (rt.ip < rt.instructions.length && steps++ < maxSteps) {
    if (rt.instructions[rt.ip] === 'W' && rt.stack.length >= 2) {
      const val = rt.stack[rt.stack.length - 1];
      const key = Number(rt.stack[rt.stack.length - 2]);
      writes.push({ ip: rt.ip + 1, key, val, hadWriteBefore: seen.has(key) });
      seen.add(key);
    }
    if (rt.instructions[rt.ip] === 'clearstack') clears.push({ ip: rt.ip + 1, depth: rt.stack.length });
    await runInstruction(rt);
  }
  return { writes, clears, truncated: steps >= maxSteps, clog: rt.clog };
}
module.exports = { trace };

if (require.main === module) {
  (async () => {
    const src = fs.readFileSync(process.argv[2], 'utf8');
    const t = await trace(src);
    console.log('clog:', JSON.stringify(t.clog), 'writes:', t.writes.length);
    console.log(t.writes.map(w => `ip${w.ip} W ${w.key}=${w.val} ${w.hadWriteBefore ? '(была запись раньше)' : '(первая запись)'}`).join('\n'));
  })();
}
