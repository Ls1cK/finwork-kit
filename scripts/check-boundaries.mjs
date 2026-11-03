import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const isInside = (directory, file) => {
  const path = relative(directory, file);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};

export function checkBoundaries(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, root);
  const errors = [config.error, ...parsed.errors].filter(Boolean).map((error) =>
    ts.flattenDiagnosticMessageText(error.messageText, '\n'),
  );
  if (errors.length) return errors;

  const sourceRoot = resolve(root, 'src');
  const allowedPackages = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const coreProgram = ts.createProgram({
    // shortcut: register new pure entries here when extending beyond the current chat exports.
    rootNames: [
      resolve(sourceRoot, 'chat/core-sse/index.ts'),
      resolve(sourceRoot, 'chat/core-detail/index.ts'),
    ],
    options: {
      ...parsed.options,
      lib: ['lib.es2020.d.ts'],
      types: [],
      noEmit: true,
      skipLibCheck: false,
      jsx: ts.JsxEmit.None,
    },
  });
  const coreFiles = new Set(coreProgram.getSourceFiles().map((file) => resolve(file.fileName)));
  for (const error of ts.getPreEmitDiagnostics(coreProgram)) {
    const location = error.file ? relative(root, error.file.fileName) + ': ' : '';
    errors.push('core: ' + location + ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }

  for (const file of ts.sys.readDirectory(sourceRoot, ['.ts', '.tsx'])) {
    const name = relative(root, file);
    const isCore = coreFiles.has(resolve(file));
    if (isCore && (file.endsWith('.tsx') || relative(sourceRoot, file).split(/[\\/]/).includes('ui'))) {
      errors.push(name + ': core cannot reach UI/TSX source');
    }
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) {
        errors.push(name + ': module loading requires a static string literal');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const info = ts.preProcessFile(text, true, true);
    if (isCore && info.libReferenceDirectives.some(({ fileName }) => /^(dom|webworker)/i.test(fileName))) {
      errors.push(name + ': core cannot reference DOM libraries');
    }
    for (const { fileName: reference } of info.referencedFiles) {
      if (!isInside(sourceRoot, resolve(dirname(file), reference))) {
        errors.push(name + ': reference must stay inside src: ' + reference);
      }
    }
    for (const { fileName: dependency } of info.importedFiles) {
      const fail = (reason) => errors.push(name + ': ' + reason + ': ' + dependency);
      if (/\.(css|less|scss|sass|svg|png|jpe?g|gif|woff2?)$/.test(dependency)) {
        if (isCore) fail('core cannot import styles/assets');
        if (!dependency.startsWith('.') || !isInside(sourceRoot, resolve(dirname(file), dependency))) {
          fail('asset must stay inside src');
        }
        continue;
      }
      const resolved = ts.resolveModuleName(dependency, file, parsed.options, ts.sys).resolvedModule;
      if (resolved && isInside(sourceRoot, resolved.resolvedFileName)) continue;
      if ((resolved && !resolved.isExternalLibraryImport) || dependency.startsWith('.') ||
        dependency.startsWith(manifest.name + '/') || isAbsolute(dependency)) {
        fail('library import must resolve inside src');
        continue;
      }
      const packageName = dependency.startsWith('@')
        ? dependency.split('/').slice(0, 2).join('/')
        : dependency.split('/')[0];
      if (!allowedPackages.has(packageName)) fail('runtime dependency is not declared');
      if (packageName === 'dumi' || packageName.startsWith('@umijs/')) {
        fail('library cannot import documentation tooling');
      }
      if (isCore && (packageName === 'react' || packageName === 'react-dom')) {
        fail('core cannot import React');
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkBoundaries(projectRoot);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Source dependencies and transitive core boundaries passed.');
  }
}
