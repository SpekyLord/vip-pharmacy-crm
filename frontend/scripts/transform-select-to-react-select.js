const path = require('path');

module.exports = function transform(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let hasSelect = false;

  root.find(j.JSXElement, {
    openingElement: { name: { type: 'JSXIdentifier', name: 'select' } },
  }).forEach((pathNode) => {
    hasSelect = true;
    pathNode.value.openingElement.name.name = 'SelectField';
    if (pathNode.value.closingElement) {
      pathNode.value.closingElement.name.name = 'SelectField';
    }
  });

  if (!hasSelect) {
    return fileInfo.source;
  }

  const hasSelectImport = root.find(j.ImportDeclaration).filter((p) => {
    return p.value.specifiers.some((spec) => spec.local && spec.local.name === 'SelectField');
  }).size() > 0;

  if (!hasSelectImport) {
    const projectRoot = process.cwd();
    const selectAbs = path.join(projectRoot, 'frontend', 'src', 'components', 'common', 'Select');
    const relPath = path.relative(path.dirname(fileInfo.path), selectAbs).replace(/\\/g, '/');
    const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;

    const importDecl = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('SelectField'))],
      j.literal(importPath)
    );

    const allImports = root.find(j.ImportDeclaration);
    if (allImports.size() > 0) {
      allImports.at(allImports.size() - 1).insertAfter(importDecl);
    } else {
      root.get().node.program.body.unshift(importDecl);
    }
  }

  return root.toSource({ quote: 'single' });
};
