const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('assets/profile-units.js','utf8').replace(/export function /g,'function '),ctx);
assert.equal(JSON.stringify(ctx.laboratoryUnits(['LACAM','Iniciação científica','Pesquisadores','Pós-graduação','LabNeuroMusc'])),JSON.stringify(['LACAM','LabNeuroMusc']));
assert.equal(JSON.stringify(ctx.savedProfileUnits(['LACAM'],['Iniciação científica','LabNeuroMusc'])),JSON.stringify(['LACAM','Iniciação científica']));
assert.equal(ctx.isLaboratoryUnit('Equipe técnica'),false);
assert.equal(ctx.isLaboratoryUnit('Equipe de movimento'),true);
console.log('Profile units: academic options separated; existing group access preserved.');
