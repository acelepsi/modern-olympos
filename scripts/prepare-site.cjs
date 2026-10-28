const fs = require('node:fs/promises');
const path = require('node:path');
const PUBLIC_FILES = ['index.html','court.html','archive.html','who-is-who.html','admin.html','style.css','landing.js','app.js','admin.js','archive.js','firebase-client.js','student-accounts.js','portraits.js','jury-reasoning.js'];
async function prepareSite(root = path.join(__dirname, '..')) {
  const output = path.join(root, 'dist');
  await fs.mkdir(output, {recursive:true});
  // Refuse extra files rather than inadvertently publishing a previous export or credential.
  for (const filename of await fs.readdir(output)) if (!PUBLIC_FILES.includes(filename)) throw Error('Unexpected file in dist. Move it out before preparing hosting.');
  for (const filename of PUBLIC_FILES) await fs.copyFile(path.join(root,filename),path.join(output,filename));
  return output;
}
if (require.main === module) prepareSite().then(()=>console.log('Public site prepared in dist; nothing deployed.')).catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={prepareSite,PUBLIC_FILES};
