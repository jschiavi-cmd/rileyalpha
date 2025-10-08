import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCxYnJhFKmqbBuNikIwsLU6dCPOU0pJwBc",
  authDomain: "riley-alpha-testing.firebaseapp.com",
  projectId: "riley-alpha-testing",
  storageBucket: "riley-alpha-testing.firebasestorage.app",
  messagingSenderId: "294222538969",
  appId: "1:294222538969:web:c658ab15032add7c93b6c8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline support
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence:', err.code);
});