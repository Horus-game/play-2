// ====== Configuración de Supabase ======
// 1. Andá a https://supabase.com → creá cuenta/proyecto (gratis).
// 2. Project Settings (⚙️) → API → copiá "Project URL" y "anon public" key acá abajo.
// 3. Creá el usuario "editor" en Authentication → Users → Add user (ver README paso 4).

window.supabaseConfig = {
  url: "https://mnuhkxflstcjeeqkocvo.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udWhreGZsc3RjamVlcWtvY3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjkzOTYsImV4cCI6MjEwNDA0NTM5Nn0.P1mR-6kgbMl4v02jis5oelxKNwjtJqs6pvnrCVsyt6Y"
};

// Email fijo usado internamente para transformar "la clave" en un login de Supabase.
// No hace falta que sea un email real, pero tiene que ser EXACTAMENTE el mismo
// que usaste al crear el usuario en Authentication → Users.
window.EDITOR_EMAIL = "editor@ps2gamepass.local";
