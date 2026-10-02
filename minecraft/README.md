# VoxelCraft

El multijugador funciona desde el frontend con Firebase Realtime Database y autenticación anónima. No hace falta desplegar ni mantener un servidor propio.

## Configurar Firebase

1. Crea un proyecto Firebase y una aplicación web.
2. En Authentication, habilita el proveedor Anonymous.
3. En Authentication > Settings, agrega el dominio de Vercel a los dominios autorizados.
4. Crea una Realtime Database y publica las reglas de `database.rules.json`.
5. Copia `.env.example` a `.env.local` y completa los valores de Firebase.

Las credenciales web de Firebase se incluyen en el cliente; las reglas de la base protegen los datos. No pongas secretos de servidor en variables `VITE_`.

## Publicar en Vercel

Importa el proyecto desde Git y configura como directorio raíz la carpeta que contiene este `package.json`. Vercel detecta Vite; el comando de compilación es `npm run build` y la carpeta de salida es `dist`.

Agrega en las variables de entorno de Vercel los cinco valores `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID` y `VITE_FIREBASE_APP_ID`. Después de guardarlos, vuelve a desplegar.

## Desarrollo

```sh
npm install
npm run dev
```

Sin las variables de Firebase el juego funciona localmente, pero el estado multijugador aparecerá desconectado.
