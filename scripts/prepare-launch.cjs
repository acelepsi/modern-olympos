const fs = require('node:fs/promises');
const path = require('node:path');
const {prepareSite}=require('./prepare-site.cjs');
const TOKEN='REPLACE_WITH_ADMIN_UID';
function rulesForAdmin(template, uid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid||'') || /^(synthetic|local-|demo-|REPLACE|PASTE_|YOUR_)/i.test(uid)) throw Error('Supply the real teacher Auth UID (not a password or synthetic UID).');
  if(template.split(TOKEN).length!==2)throw Error('Expected one administrator placeholder in the rules template.');
  return template.replace(TOKEN,uid);
}
async function prepareLaunch(uid, root=path.join(__dirname,'..')){
  const template=await fs.readFile(path.join(root,'firestore.rules'),'utf8');
  const rules=rulesForAdmin(template,uid);
  await prepareSite(root);await fs.mkdir(path.join(root,'.launch'),{recursive:true});
  await fs.writeFile(path.join(root,'.launch','firestore.rules'),rules);
}
async function verifyLaunch(root=path.join(__dirname,'..')){
  const template=await fs.readFile(path.join(root,'firestore.rules'),'utf8');
  const actual=await fs.readFile(path.join(root,'.launch','firestore.rules'),'utf8');
  const parts=template.split(TOKEN);if(parts.length!==2||!actual.startsWith(parts[0])||!actual.endsWith(parts[1]))throw Error('Prepared rules are stale or modified. Run prepare:launch again.');
  const uid=actual.slice(parts[0].length,actual.length-parts[1].length);
  if(rulesForAdmin(template,uid)!==actual)throw Error('Prepared rules do not match the current template.');
}
if(require.main===module){
 const args=process.argv.slice(2);
 const task=args.length===1&&args[0]==='--verify'?verifyLaunch():args.length===2&&args[0]==='--admin-uid'?prepareLaunch(args[1]):Promise.reject(Error('Use npm run prepare:launch -- --admin-uid YOUR_TEACHER_UID'));
 task.then(()=>console.log('Launch files checked/prepared locally; nothing deployed.')).catch(error=>{console.error(error.message);process.exitCode=1});
}
module.exports={rulesForAdmin,prepareLaunch,verifyLaunch};
