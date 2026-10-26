async function createDocumentRepository(engine) {
    if (engine === 'mongodb') {
        const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 7000 });
        await client.connect();

        // 🔧 Usamos la base de datos 'mario_hub'
        const db = client.db('mario_hub');

        return {
            async findUser(identity) {
                const row = await db.collection('mario_users').findOne({
                    $or: [
                        { id: identity },
                        { email: new RegExp(`^${escape(identity)}$`, 'i') },
                        { username: new RegExp(`^${escape(identity)}$`, 'i') }
                    ]
                });
                return row && mapUser(row);
            },
            async insertUser(item) {
                // 🔒 Validación de duplicados
                const existing = await db.collection('mario_users').findOne({
                    $or: [
                        { email: new RegExp(`^${escape(item.email)}$`, 'i') },
                        { username: new RegExp(`^${escape(item.username)}$`, 'i') }
                    ]
                });
                if (existing) {
                    throw new Error('El usuario o correo electrónico ya se encuentra registrado.');
                }
                await db.collection('mario_users').insertOne(item);
                return item;
            },
            async updateUser(item) { await db.collection('mario_users').replaceOne({id:item.id}, item); return item; },
            async insertSession(item) { await db.collection('mario_sessions').insertOne(item); return item; },
            async findSession(token) { return db.collection('mario_sessions').findOne({token, expiresAt:{$gt:Date.now()}},{projection:{_id:0}}); },
            async deleteSession(token) { await db.collection('mario_sessions').deleteOne({token}); },
            async insertResetCode(item) { await db.collection('mario_reset_codes').insertOne(item); return item; },
            async findResetCode(userId, code) { return db.collection('mario_reset_codes').findOne({userId, code, expiresAt:{$gt:Date.now()}},{projection:{_id:0}}); },
            async deleteResetCode(id) { await db.collection('mario_reset_codes').deleteOne({id}); },
            async insertScore(item) { await db.collection('mario_scores').insertOne(item); return item; },
            async scores(userId) { return db.collection('mario_scores').find({userId},{projection:{_id:0}}).sort({timestamp:-1}).toArray(); },
            async leaderboard() { return db.collection('mario_scores').aggregate([{$sort:{score:-1}},{$limit:20},{$lookup:{from:'mario_users',localField:'userId',foreignField:'id',as:'user'}},{$unwind:'$user'},{$project:{_id:0,username:'$user.username',id:1,userId:1,gameTitle:1,score:1,timestamp:1}}]).toArray(); },
            async insertAchievement(item) { await db.collection('mario_achievements').insertOne(item); return item; },
            async achievements(userId) { return db.collection('mario_achievements').find({userId},{projection:{_id:0}}).sort({unlockedAt:-1}).toArray(); },
            async insertActivity(item) { await db.collection('mario_activity').insertOne(item); return item; },
            async activity(userId) { return db.collection('mario_activity').find({userId},{projection:{_id:0}}).sort({createdAt:-1}).limit(30).toArray(); },
            async close() { await client.close(); }
        };
    }

    const client = new Redis({url:process.env.UPSTASH_REDIS_REST_URL, token:process.env.UPSTASH_REDIS_REST_TOKEN});
    const key = name => `mario:${engine}:${name}`;
    const list = async name => parse(await client.get(key(name)), []);
    const save = async (name, value) => { await client.set(key(name), JSON.stringify(value)); return value; };
    const repo = {
        async findUser(identity) { return (await list('users')).find(item => item.id === identity || item.email.toLowerCase() === identity || item.username.toLowerCase() === identity); },
        async insertUser(item) { const all=await list('users'); all.push(item); await save('users',all); return item; },
        async updateUser(item) { const all=await list('users'); await save('users',all.map(x=>x.id===item.id?item:x)); return item; },
        async insertSession(item) { const all=await list('sessions'); all.push(item); await save('sessions',all); return item; },
        async findSession(token) { return (await list('sessions')).find(x=>x.token===token&&x.expiresAt>Date.now()); },
        async deleteSession(token) { await save('sessions',(await list('sessions')).filter(x=>x.token!==token)); },
        async insertResetCode(item) { const all=await list('resetCodes'); all.push(item); await save('resetCodes',all); return item; },
        async findResetCode(userId, code) { return (await list('resetCodes')).find(x=>x.userId===userId&&x.code===code&&x.expiresAt>Date.now()); },
        async deleteResetCode(id) { await save('resetCodes',(await list('resetCodes')).filter(x=>x.id!==id)); },
        async insertScore(item) { const all=await list('scores'); all.push(item); await save('scores',all); return item; },
        async scores(userId) { return (await list('scores')).filter(x=>x.userId===userId).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)); },
        async leaderboard() { const users=await list('users'); const byId=Object.fromEntries(users.map(x=>[x.id,x.username])); return (await list('scores')).sort((a,b)=>b.score-a.score).slice(0,20).map(x=>({...x,username:byId[x.userId]||'Jugador'})); },
        async insertAchievement(item) { const all=await list('achievements'); all.push(item); await save('achievements',all); return item; },
        async achievements(userId) { return (await list('achievements')).filter(x=>x.userId===userId); },
        async insertActivity(item) { const all=await list('activity'); all.push(item); await save('activity',all); return item; },
        async activity(userId) { return (await list('activity')).filter(x=>x.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30); },
        async close() {}
    };
    return repo;
}