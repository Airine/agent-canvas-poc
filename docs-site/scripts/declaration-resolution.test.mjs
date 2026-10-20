import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

test('runtime worker resolves model recovery implementation to its type sidecar', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const worker = path.join(root, 'app/scripts/e-runtime-worker.mts');
  const source = ts.createSourceFile(worker, readFileSync(worker, 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(statement =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === '../shared/model-recovery.mjs');
  assert.ok(declaration, 'the real worker must still import the recovery implementation');
  const result = ts.resolveModuleName(
    declaration.moduleSpecifier.text,
    worker,
    { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
    ts.sys,
  );
  assert.equal(result.resolvedModule?.resolvedFileName, path.join(root, 'app/shared/model-recovery.d.mts'));
});
