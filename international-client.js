import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,connectFirestoreEmulator,collection,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {initializeFirebaseClient} from './firebase-client.js';
import {setupInternationalCourt} from './international-court.js';
// The shared initializer preserves the local demo/emulator isolation safeguards.
try{
 const {db}=initializeFirebaseClient({initializeApp,getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,getFirestore,connectFirestoreEmulator});
 setupInternationalCourt({schools:()=>getDocsFromServer(collection(db,'publicSchools')),trials:()=>getDocsFromServer(collection(db,'trials'))});
}catch{
 document.getElementById('international-directory-status').textContent='Partner school information is temporarily unavailable.';
 document.getElementById('international-trial-status').textContent='Public trial total is temporarily unavailable.';
 document.getElementById('international-refresh').disabled=true;
}
