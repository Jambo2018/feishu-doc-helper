const fs = require('node:fs');
const ts = require('typescript');
const compile = (module, file) => {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(result.outputText, file);
};
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
