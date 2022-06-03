const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
const resolve = require("resolve").sync;

let ID = 0;

function createModuleObject(filePath) {
  const source = fs.readFileSync(filePath, "utf-8");

  const ast = parser.parse(source, {
    sourceType: "module",
  });

  const deps = [];

  traverse(ast, {
    ImportDeclaration(path) {
      deps.push(path.node.source.value);
    },
  });

  let id = ID++;

  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return {
    id,
    code,
    deps,
    filePath,
  };
}

function getModules(entry) {
  const rootModule = createModuleObject(entry);

  const modules = [rootModule];

  for (const module of modules) {
    module.map = {};

    for (const dependency of module.deps) {
      const dependencyPath = resolve(dependency, {
        basedir: path.dirname(module.filePath),
      });
      const dependencyObject = createModuleObject(dependencyPath);

      module.map[dependency] = dependencyObject.id;

      modules.push(dependencyObject);
    }
  }

  return modules;
}

function pack(moduleGraph) {
  const moduleSource = moduleGraph.map(
    (module) =>
      `
        ${module.id}: {
            factory: (exports, require) => {
                ${module.code}
            },
            map: ${JSON.stringify(module.map)}  
        }
        `
  );

  const iifeBundler = `(function(modules){
        const require = id => {
          const {factory, map} = modules[id];
          const localRequire = requireDeclarationName => require(map[requireDeclarationName]); 
          const module = {exports: {}};
          factory(module.exports, localRequire); 
          return module.exports; 
        } 
        require(0);
      })({${moduleSource.join()}})
      `;
  return iifeBundler;
}

module.exports = (entry) => pack(getModules(entry));
