const academicGroups=new Set(['Pesquisadores','Pós-graduação','Iniciação científica','Equipe técnica']);
export function isLaboratoryUnit(name){return !academicGroups.has(name);}
export function laboratoryUnits(units){return units.filter(isLaboratoryUnit);}
export function savedProfileUnits(selected,previous){
  return [...new Set([...laboratoryUnits(selected),...previous.filter(name=>academicGroups.has(name)&&name!=='Equipe técnica')])];
}
