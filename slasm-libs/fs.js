const fs = require('fs');
const path = require('path');

module.exports = {
    read:    { args: 1, returns: 1, fn: ([p])       => [fs.readFileSync(p, 'utf-8')] },
    write:   { args: 2, returns: 0, fn: ([p, data]) => { fs.writeFileSync(p, data, 'utf-8'); } },
    append:  { args: 2, returns: 0, fn: ([p, data]) => { fs.appendFileSync(p, data, 'utf-8'); } },
    delete:  { args: 1, returns: 0, fn: ([p])       => { fs.rmSync(p, { force: true }); } },
    exists:  { args: 1, returns: 1, fn: ([p])       => [String(fs.existsSync(p))] },
    isfile:  { args: 1, returns: 1, fn: ([p])       => [String(fs.existsSync(p) && fs.statSync(p).isFile())] },
    isdir:   { args: 1, returns: 1, fn: ([p])       => [String(fs.existsSync(p) && fs.statSync(p).isDirectory())] },
    size:    { args: 1, returns: 1, fn: ([p])       => [String(fs.statSync(p).size)] },
    mkdir:   { args: 1, returns: 0, fn: ([p])       => { fs.mkdirSync(p, { recursive: true }); } },
    rmdir:   { args: 1, returns: 0, fn: ([p])       => { fs.rmSync(p, { recursive: true, force: true }); } },
    rename:  { args: 2, returns: 0, fn: ([a, b])    => { fs.renameSync(a, b); } },
    copy:    { args: 2, returns: 0, fn: ([a, b])    => { fs.copyFileSync(a, b); } },
    list:    { args: 1, returns: 1, fn: ([p])       => [fs.readdirSync(p).join('\x1f')] },
    cwd:     { args: 0, returns: 1, fn: ()          => [process.cwd()] },
    abs:     { args: 1, returns: 1, fn: ([p])       => [path.resolve(p)] },
    dirname: { args: 1, returns: 1, fn: ([p])       => [path.dirname(p)] },
    basename:{ args: 1, returns: 1, fn: ([p])       => [path.basename(p)] },
    ext:     { args: 1, returns: 1, fn: ([p])       => [path.extname(p)] },
    join:    { args: 2, returns: 1, fn: ([a, b])    => [path.join(a, b)] },
};
