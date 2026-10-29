// Uses an isolated, memory-only Auth session; the teacher remains signed in.
export function validateStudentInput({code, name, password, schoolId=''}) {
  code = code.trim().toLowerCase(); name = name.trim();
  if (!/^[a-z0-9-]{4,24}$/.test(code)) throw Error('Student code must contain 4–24 letters, numbers or hyphens.');
  if (!name || name.length > 100) throw Error('Enter a display alias of 1–100 characters.');
  if (password.length < 8 || password.length > 128) throw Error('Choose a password of 8–128 characters.');
  if(typeof schoolId!=='string'||(schoolId&&!/^[A-Za-z0-9_-]{1,80}$/.test(schoolId)))throw Error('Choose a valid school or No school.');
  return {code, name, password,...schoolId?{schoolId}:{}};
}
export async function provisionStudent(input, api) {
  const {code, name, password,schoolId} = validateStudentInput(input);
  if (!api.current()) throw Error('Administrator session changed. Sign in again.');
  const session = api.open(); let user, attemptedProfile = false;
  const profile = {displayName: name, accountType: 'student', active: true,...schoolId?{schoolId,publicSchool:false}:{}};
  try {
    ({user} = await api.create(session.auth, `${code}@${session.accountDomain}`, password));
    if (!api.current()) throw Error('Administrator session changed. Student creation cancelled.');
    attemptedProfile = true;
    await api.save(user.uid, profile);
    return {id: user.uid, code, ...profile};
  } catch (error) {
    if (user) {
      // An unacknowledged write may have committed. Check before deleting a new Auth account.
      try {
        const saved = attemptedProfile ? await api.read(user.uid) : null;
        if (saved?.exists()) {
          const data = saved.data();
          if (data.accountType === 'student' && data.displayName === name && data.active === true && (data.schoolId||'')===(schoolId||'') && data.publicSchool!==true) return {id: user.uid, code, ...profile};
          throw Error('Unexpected profile exists.');
        }
        await api.remove(user);
      } catch {
        throw Error(`Student creation could not be confirmed or cleaned up (UID ${user.uid}). Check this new account in Firebase Console before retrying. Do not recreate it blindly.`);
      }
    }
    throw error;
  } finally { await api.close(session); }
}
