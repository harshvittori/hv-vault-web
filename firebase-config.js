/* Firebase web config shared by HV Vault and Harsh Reset (Firebase project: harsh-reset).
   These values are public by design; the Firestore security rules are what protect data.
   Paste apiKey and appId from: Firebase console > Project settings > General > Your apps > Web app. */
window.HV_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDggasAVdqpvamkn1xeex2NmPUqG9JiZJ4",
  authDomain: "harsh-reset.firebaseapp.com",
  projectId: "harsh-reset",
  appId: "1:592094409539:web:57d3aa494464b867bbf5f6",
  // App Check: paste the reCAPTCHA v3 *site* key (public) here once the web app is registered in
  // Firebase console > App Check. Leave empty to run without App Check. Never put the secret key here.
  appCheckSiteKey: "",
  appCheckProvider: "v3",   // "v3" or "enterprise"
};
