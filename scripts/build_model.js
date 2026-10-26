const fs=require('node:fs');const engine=require('../nba-impact-engine');
const data=JSON.parse(fs.readFileSync('data/nba-teams-2026.json'));
const model=engine.fit(data.teams);model.source={file:'nba-teams-2026.json',season:data.season,status:data.status,generatedAt:data.generatedAt};model.generatedAt=new Date().toISOString();
fs.writeFileSync('data/nba-probability-model.json',JSON.stringify(model));console.log(JSON.stringify(model.validation,null,2));
