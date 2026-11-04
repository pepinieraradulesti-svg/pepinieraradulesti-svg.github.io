import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export class Store{
 constructor(dir){mkdirSync(dir,{recursive:true,mode:0o700});this.db=new DatabaseSync(join(dir,'private.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS pairs(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,device TEXT,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,hash TEXT UNIQUE,data TEXT NOT NULL,created INTEGER);
 CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,client TEXT UNIQUE,version INTEGER NOT NULL,data TEXT NOT NULL,confirmed TEXT,deleted INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,idem TEXT UNIQUE,post TEXT NOT NULL,version INTEGER NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,commit_sha TEXT,error TEXT,created INTEGER NOT NULL,verified INTEGER);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,action TEXT,object_id TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS ratelimits(key TEXT PRIMARY KEY,count INTEGER,until_ms INTEGER);`);
 }
 close(){this.db.close()}
 audit(action,id){this.db.prepare('INSERT INTO events(action,object_id,created) VALUES(?,?,?)').run(action,id,Date.now())}
 pairCode(){const code=randomBytes(12).toString('base64url');this.db.prepare('INSERT INTO pairs VALUES(?,?)').run(hash(code),Date.now()+600000);return code}
 limited(key,max=10,window=600000){const now=Date.now();const r=this.db.prepare('SELECT * FROM ratelimits WHERE key=?').get(key);if(!r||r.until_ms<now){this.db.prepare('INSERT OR REPLACE INTO ratelimits VALUES(?,?,?)').run(key,1,now+window);return false}this.db.prepare('UPDATE ratelimits SET count=count+1 WHERE key=?').run(key);return r.count>=max}
 pair(code,device){this.db.exec('BEGIN IMMEDIATE');try{const row=this.db.prepare('SELECT * FROM pairs WHERE hash=?').get(hash(code));if(!row||row.expires<Date.now()){this.db.exec('ROLLBACK');return null}this.db.prepare('DELETE FROM pairs WHERE hash=?').run(hash(code));const token=randomBytes(32).toString('base64url');this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),device.slice(0,80),Date.now()+90*86400000);this.db.exec('COMMIT');this.audit('pair',hash(token).slice(0,12));return token}catch(e){this.db.exec('ROLLBACK');throw e}}
 session(token){return this.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(token),Date.now())}
 revoke(token){this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token))}
 issueSession(device){const token=randomBytes(32).toString('base64url');this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),String(device).slice(0,80),Date.now()+90*86400000);return token}
 media(id){const x=this.db.prepare('SELECT data FROM media WHERE id=?').get(id);return x?JSON.parse(x.data):null}
 mediaByHash(h){const x=this.db.prepare('SELECT data FROM media WHERE hash=?').get(h);return x?JSON.parse(x.data):null}
 saveMedia(h,data){this.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(data.id,h,JSON.stringify(data),Date.now());return data}
 post(id){const x=this.db.prepare('SELECT * FROM posts WHERE id=? AND deleted=0').get(id);return x?{...JSON.parse(x.data),id:x.id,version:x.version,confirmed:x.confirmed?JSON.parse(x.confirmed):null}:null}
 posts(){return this.db.prepare('SELECT id FROM posts WHERE deleted=0 ORDER BY rowid DESC').all().map(x=>this.post(x.id))}
 create(client,data){const x=this.db.prepare('SELECT id FROM posts WHERE client=?').get(client);if(x)return this.post(x.id);const id=randomUUID();this.db.prepare('INSERT INTO posts(id,client,version,data) VALUES(?,?,?,?)').run(id,client,1,JSON.stringify({...data,created:new Date().toISOString()}));this.audit('draft',id);return this.post(id)}
 edit(id,version,data){const x=this.post(id);if(!x)return null;if(x.version!==version)throw Object.assign(Error('Publicarea a fost modificată. Reîncarcă lista.'),{status:409});if(this.db.prepare("SELECT id FROM jobs WHERE post=? AND state IN ('queued','working','verifying','failed')").get(id))throw Object.assign(Error('Așteaptă încheierea publicării curente sau reia verificarea.'),{status:409});this.db.prepare('UPDATE posts SET data=?,version=version+1 WHERE id=?').run(JSON.stringify({...data,created:x.created}),id);this.audit('edit',id);return this.post(id)}
 job(id){const x=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);return x?{...x,payload:JSON.parse(x.payload)}:null}
 enqueue(id,version,action,idem){const old=this.db.prepare('SELECT id,post,version,action FROM jobs WHERE idem=?').get(idem);if(old){if(old.post!==id||old.version!==version||old.action!==action)throw Object.assign(Error('Cheie de operație reutilizată incorect.'),{status:409});return this.job(old.id)}if(this.db.prepare("SELECT id FROM jobs WHERE state IN ('queued','working','verifying','failed')").get())throw Object.assign(Error('O altă actualizare așteaptă confirmarea. Reia verificarea acesteia.'),{status:409});if(this.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE created>?').get(Date.now()-3600000).n>=8)throw Object.assign(Error('Au fost multe actualizări într-un timp scurt. Încearcă din nou peste o oră.'),{status:429});const p=this.post(id);if(!p)throw Object.assign(Error('Publicarea nu există.'),{status:404});if(version!==p.version)throw Object.assign(Error('Versiune învechită.'),{status:409});if(this.db.prepare("SELECT id FROM jobs WHERE post=? AND state IN ('queued','working','verifying')").get(id))throw Object.assign(Error('Operație deja în curs.'),{status:409});const job=randomUUID();this.db.prepare('INSERT INTO jobs(id,idem,post,version,action,payload,state,created) VALUES(?,?,?,?,?,?,?,?)').run(job,idem,id,version,action,JSON.stringify({...p,confirmed:undefined}),'queued',Date.now());this.audit(action,id);return this.job(job)}
 updateJob(id,state,extra={}){this.db.prepare('UPDATE jobs SET state=?,commit_sha=COALESCE(?,commit_sha),error=?,verified=COALESCE(?,verified) WHERE id=?').run(state,extra.commit||null,extra.error||null,extra.verified||null,id)}
 confirm(job,confirmation){if(job.action==='delete')this.db.prepare('UPDATE posts SET deleted=1,confirmed=NULL WHERE id=?').run(job.post);else this.db.prepare('UPDATE posts SET confirmed=? WHERE id=?').run(JSON.stringify({...job.payload,version:job.version,visible:job.action==='publish',...confirmation}),job.post);this.updateJob(job.id,'done',{verified:Date.now()});this.audit('verified-'+job.action,job.post)}
 confirmed(){return this.posts().map(p=>p.confirmed).filter(p=>p?.visible)}
 pending(){return this.db.prepare("SELECT id FROM jobs WHERE state IN ('queued','working','verifying') ORDER BY created").all().map(x=>this.job(x.id))}
 latestJob(id){const x=this.db.prepare('SELECT id FROM jobs WHERE post=? ORDER BY created DESC,rowid DESC LIMIT 1').get(id);return x?this.job(x.id):null}
}
