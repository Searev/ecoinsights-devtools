const fs = require("fs");

const arg = process.argv[2];

const manifestFirefox = "manifestFirefox.json";
const manifestChrome = "manifestChrome.json";
const manifest = "manifest.json";

switch (arg) {
  case "-firefox":
    customizeBuild(manifestFirefox, manifestChrome);
    break;
  case "-chrome":
    customizeBuild(manifestChrome, manifestFirefox);
    break;
  default:
    console.log(
      `Unknown target ${arg} : authorized values are '-firefox' and '-chrome'`
    );
}

async function customizeBuild(manfestToKeep, manifestToRemove) {
  fs.renameSync(`./dist/${manfestToKeep}`, `./dist/${manifest}`);
  fs.unlinkSync(`./dist/${manifestToRemove}`);
}
