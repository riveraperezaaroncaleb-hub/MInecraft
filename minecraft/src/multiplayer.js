import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
    get, getDatabase, onChildAdded, onChildChanged, onChildRemoved, onDisconnect,
    onValue, ref, set, update
} from 'firebase/database';

const handlers = new Map();
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function dispatch(event, data) {
    for (const handler of handlers.get(event) || []) handler(data);
}

export const multiplayer = {
    id: null,
    connected: false,
    sessionId: crypto.randomUUID(),
    playerState: { x: 0, y: 100, z: 0, r: 0 },
    on(event, handler) {
        const eventHandlers = handlers.get(event) || [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
    },
    emit(event, data) {
        if (!this.connected || !this.playerRef || !this.blocksRef) return;
        if (event === 'move') {
            const now = Date.now();
            if (now - this.lastMoveAt < 100) return;
            this.lastMoveAt = now;
            this.playerState = { ...this.playerState, ...data };
            update(this.playerRef, this.playerState).catch((error) => console.error('No se pudo sincronizar el jugador:', error));
        } else if (event === 'setBlock') {
            const blockId = `${Math.floor(data.x)}_${Math.floor(data.y)}_${Math.floor(data.z)}`;
            const blockRef = ref(this.database, `rooms/main/blocks/${blockId}`);
            const block = data.type
                ? { ...data, updatedBy: this.sessionId, removed: false }
                : { x: data.x, y: data.y, z: data.z, updatedBy: this.sessionId, removed: true };
            set(blockRef, block).catch((error) => console.error('No se pudo sincronizar el bloque:', error));
        }
    },
    lastMoveAt: 0,
    database: null,
    playerRef: null,
    blocksRef: null
};

if (Object.values(firebaseConfig).every(Boolean)) {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const database = getDatabase(app);

        signInAnonymously(auth).then(async ({ user }) => {
            const playersRef = ref(database, 'rooms/main/players');
            const blocksRef = ref(database, 'rooms/main/blocks');
            const playerId = user.uid;
            const playerRef = ref(database, `rooms/main/players/${playerId}`);
            let ready = false;
            let existingPlayers = new Set();
            let existingBlocks = new Set();
            const pendingEvents = [];
            const afterInitialSync = (callback) => {
                if (ready) callback();
                else pendingEvents.push(callback);
            };

            multiplayer.id = playerId;
            multiplayer.database = database;
            multiplayer.playerRef = playerRef;
            multiplayer.blocksRef = blocksRef;

            onChildAdded(playersRef, (snapshot) => afterInitialSync(() => {
                if (snapshot.key && snapshot.key !== playerId && !existingPlayers.has(snapshot.key)) {
                    dispatch('playerJoined', snapshot.key);
                    dispatch('playerMoved', { id: snapshot.key, data: snapshot.val() });
                    existingPlayers.add(snapshot.key);
                }
            }));
            onChildChanged(playersRef, (snapshot) => afterInitialSync(() => {
                if (snapshot.key && snapshot.key !== playerId) {
                    dispatch('playerMoved', { id: snapshot.key, data: snapshot.val() });
                }
            }));
            onChildRemoved(playersRef, (snapshot) => afterInitialSync(() => {
                if (snapshot.key && snapshot.key !== playerId) dispatch('playerLeft', snapshot.key);
            }));

            const dispatchBlock = (snapshot, type = 'blockUpdate') => {
                const block = snapshot.val();
                if (snapshot.key && block?.updatedBy !== multiplayer.sessionId) {
                    dispatch(type, block?.removed ? { ...block, type: null } : block);
                }
            };
            onChildAdded(blocksRef, (snapshot) => afterInitialSync(() => {
                if (snapshot.key && !existingBlocks.has(snapshot.key)) dispatchBlock(snapshot);
                if (snapshot.key) existingBlocks.add(snapshot.key);
            }));
            onChildChanged(blocksRef, (snapshot) => afterInitialSync(() => dispatchBlock(snapshot)));
            onChildRemoved(blocksRef, (snapshot) => afterInitialSync(() => {
                const [x, y, z] = (snapshot.key || '').split('_').map(Number);
                if ([x, y, z].every(Number.isFinite)) dispatch('blockUpdate', { x, y, z, type: null });
            }));

            const [playersSnapshot, blocksSnapshot] = await Promise.all([get(playersRef), get(blocksRef)]);
            const players = playersSnapshot.val() || {};
            const blocks = blocksSnapshot.val() || {};
            existingPlayers = new Set(Object.keys(players));
            existingBlocks = new Set(Object.keys(blocks));
            dispatch('init', {
                id: playerId,
                players,
                modifiedBlocks: Object.values(blocks).map((block) => block.removed ? { ...block, type: null } : block)
            });
            ready = true;
            pendingEvents.splice(0).forEach((callback) => callback());

            onValue(ref(database, '.info/connected'), async (snapshot) => {
                multiplayer.connected = snapshot.val() === true;
                if (!multiplayer.connected) return;
                try {
                    await onDisconnect(playerRef).remove();
                    await set(playerRef, multiplayer.playerState);
                } catch (error) {
                    console.error('No se pudo registrar el jugador:', error);
                }
            });
        }).catch((error) => console.error('No se pudo conectar con Firebase:', error));
    } catch (error) {
        console.error('Configuración de Firebase inválida:', error);
    }
}