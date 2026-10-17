// Xcode 26's clang rejects fmt 11's consteval format strings (bundled with
// React Native 0.81: "call to consteval function ... is not a constant
// expression"). Compiling just the fmt pod as C++17 turns consteval off in
// fmt. Harmless on older Xcode (EAS cloud images), needed for local builds.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARK = '# with-fmt-cxx17';
const SNIPPET = `
    ${MARK}
    installer.pods_project.targets.each do |t|
      next unless t.name == 'fmt'
      t.build_configurations.each { |c| c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17' }
    end`;

module.exports = config => withDangerousMod(config, ['ios', async cfg => {
  const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes(MARK)) {
    src = src.replace(/post_install do \|installer\|/, m => m + SNIPPET);
    fs.writeFileSync(file, src);
  }
  return cfg;
}]);
