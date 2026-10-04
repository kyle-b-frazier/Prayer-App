import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBzsnkFikMGtsWkFR837c-n15ozxVjAGXk",
    authDomain: "prayer-app-cloud.firebaseapp.com",
    projectId: "prayer-app-cloud",
    storageBucket: "prayer-app-cloud.firebasestorage.app",
    messagingSenderId: "1090528891146",
    appId: "1:1090528891146:web:073dbda89ecd8682736af3",
    measurementId: "G-9NZMGRVZQ8"
};

const app = initializeApp(firebaseConfig);
let db;
try {
    // Offline cache: reads and writes keep working without signal and sync later.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
    db = getFirestore(app);
}
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let cloudDB = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [], everyday: [] };
let userDocRef = null;
let unsubscribe = null;

window.handleAuth = () => {
    if (!auth.currentUser) {
        signInWithPopup(auth, provider).catch(err => alert("Login failed: " + err.message));
    } else {
        signOut(auth).then(() => window.location.reload());
    }
};

onAuthStateChanged(auth, (user) => {
    const loginBtn = document.getElementById('googleLoginBtn');
    const statusMsg = document.getElementById('syncStatus');

    if (user) {
        loginBtn.innerText = "Sign Out";
        statusMsg.innerText = "Connecting...";
        userDocRef = doc(db, "users", user.uid);

        if (unsubscribe) unsubscribe();
        unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const incomingData = docSnap.data();
                const isCloudEmpty = Object.values(incomingData).every(arr => arr.length === 0);
                const localBackup = localStorage.getItem('prayer_backup');

                if (isCloudEmpty && localBackup) {
                    statusMsg.innerText = "Using local backup";
                    cloudDB = JSON.parse(localBackup);
                } else {
                    cloudDB = incomingData;
                    localStorage.setItem('prayer_backup', JSON.stringify(cloudDB));
                    statusMsg.innerText = "Cloud Synced";
                }
                renderPrayers();
                renderSpecialManager();
            } else {
                statusMsg.innerText = "Cloud Empty";
            }
        }, (err) => {
            statusMsg.innerText = "Sync Error";
        });
    } else {
        loginBtn.innerText = "Login";
        statusMsg.innerText = "Guest Mode";
        cloudDB = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [], everyday: [] };
        renderPrayers();
    }
});

window.replaceDB = (d) => { cloudDB = d; };

window.getDB = () => { ['monthly', 'answered', 'prayed'].forEach(k => { if (!Array.isArray(cloudDB[k])) cloudDB[k] = []; }); return cloudDB; };

window.saveDB = async (newData) => {
    const isOldDataNotEmpty = Object.values(cloudDB).some(arr => arr.length > 0);
    const isNewDataEmpty = Object.values(newData).every(arr => arr.length === 0);

    if (isOldDataNotEmpty && isNewDataEmpty) {
        console.error("Safety Valve: Blocked empty overwrite.");
        return;
    }

    if (window.snapshotBackup) window.snapshotBackup();

    if (userDocRef) {
        try {
            await setDoc(userDocRef, newData);
            localStorage.setItem('prayer_backup', JSON.stringify(newData));
        } catch (e) {
            console.error("Save Error", e);
        }
    } else {
        localStorage.setItem('prayer_backup', JSON.stringify(newData));
    }
};

window.exportData = () => {
    const data = JSON.stringify(getDB(), null, 2);
    navigator.clipboard.writeText(data).then(() => {
        alert("Copied! Paste this into Notes for safekeeping.");
    }).catch(() => alert("Copy failed. Check permissions."));
};
