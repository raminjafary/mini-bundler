const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
const detective = require("detective");

let ID = 0;

function createModuleObject(filePath) {
  const source = fs.readFileSync(filePath, "utf-8");
  const cjsDeps = detective(source);

  let code,
    isESM,
    deps = [];

  if (cjsDeps.length) {
    deps = cjsDeps;
    isESM = false;
    code = source;
  } else {
    const ast = parser.parse(source, {
      sourceType: "module",
    });

    traverse(ast, {
      ImportDeclaration(path) {
        deps.push(path.node.source.value);
      },
    });

    code = babel.transformFromAst(ast, null, {
      presets: ["@babel/preset-env"],
    }).code;

    isESM = true;
  }

  let id = ID++;

  return {
    id,
    code,
    deps,
    filePath,
    isESM,
  };
}

function getModules(entry) {
  const rootModule = createModuleObject(entry);

  const modules = [rootModule];

  for (const module of modules) {
    module.map = {};

    for (const dependency of module.deps) {
      const basedir = path.dirname(module.filePath);
      const moduleBasedir = path.join(basedir, dependency);
      const dependencyAbsPath = path.resolve(moduleBasedir);

      const dependencyObject = createModuleObject(dependencyAbsPath);

      module.map[dependency] = dependencyObject.id;

      modules.push(dependencyObject);
    }
  }

  return modules;
}

function pack(moduleGraph) {
  const isESM = moduleGraph[0].isESM;

  const moduleSource = moduleGraph.map((module) => {
    let exportsStatement;

    if (isESM) {
      exportsStatement = "exports";
    } else {
      exportsStatement = "module";
    }

    return `
      ${module.id}: {
          factory: (${exportsStatement}, require) => {
              ${module.code}
          },
          map: ${JSON.stringify(module.map)}  
      }
      `;
  });

  let factoryExportsStatement;

  if (isESM) {
    factoryExportsStatement = "module.exports";
  } else {
    factoryExportsStatement = "module";
  }

  const iifeBundler = `(function(modules){
        const require = id => {
          const {factory, map} = modules[id];
          const localRequire = requireDeclarationName => require(map[requireDeclarationName]); 
          const module = {exports: {}};
          factory(${factoryExportsStatement}, localRequire); 
          return module.exports; 
        } 
        require(0);
      })({${moduleSource.join()}})
      `;
  return iifeBundler;
}

module.exports = (entry) => pack(getModules(entry));
