const fs = require("fs");
const path = require("path");
const detective = require("detective");
const resolve = require("resolve").sync;

let ID = 0;

function createModuleObject(path) {
  const source = fs.readFileSync(path, "utf-8");
  const requires = detective(source);
  const id = ID++;

  return {
    id,
    path,
    source,
    requires,
  };
}

function getModules(entry) {
  const rootModule = createModuleObject(entry);
  const modules = [rootModule];

  for (const module of modules) {
    module.map = {};

    for (const dependency of module.requires) {
      const basedir = path.dirname(module.path);
      const dependencyPath = resolve(dependency, { basedir });

      const dependencyObject = createModuleObject(dependencyPath);

      module.map[dependency] = dependencyObject.id;
      modules.push(dependencyObject);
    }
  }

  return modules;
}

function pack(modules) {
  const modulesSource = modules
    .map(
      (module) =>
        `${module.id}: {
            factory: (module, require) => {
                ${module.source}
            },
            map: ${JSON.stringify(module.map)}
        }`
    )
    .join();

  return `(modules => {
        const require = id => {
          const { factory, map } = modules[id]
          const localRequire = name => require(map[name])
          const module = { exports: {} }
          factory(module, localRequire)
          return module.exports
        }
        require(0)
      })({ ${modulesSource} })`;
}

module.exports = (entry) => pack(getModules(entry));
