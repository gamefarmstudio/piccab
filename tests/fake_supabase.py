# A tiny fake of Supabase (Auth + PostgREST + the RPCs Piccab uses) for the browser tests: python3 tests/fake_supabase.py 54321
import http.server, json, sys, uuid, base64, time, urllib.parse, re, threading
LOCK=threading.Lock()
DB={t:[] for t in ['profiles','scenes','progress','decks','shares','classes','class_members','class_items','class_progress','friend_profiles','friendships','friend_blocks','friend_events','friend_reports','ai_usage']}
SEQ={'n':0}
KEYS={'scenes':['user_id','id'],'progress':['user_id','scene_id'],'decks':['user_id','id'],'shares':['id'],'classes':['id'],
      'class_members':['class_id','user_id'],'class_items':['class_id','share_id'],'class_progress':['class_id','share_id','user_id'],'profiles':['id'],'friend_profiles':['user_id'],'friendships':['a','b'],'friend_blocks':['user_id','blocked'],'friend_events':['id'],'friend_reports':['id'],'ai_usage':['id']}
USERS={}   # uid -> user
TOKENS={}  # token -> uid
def tok_for(uid):
    t='h.'+base64.urlsafe_b64encode(json.dumps({'sub':uid,'exp':int(time.time())+3600,'role':'authenticated'}).encode()).decode().rstrip('=')+'.s'
    TOKENS[t]=uid; return t
def session(uid):
    now=int(time.time()); return {'access_token':tok_for(uid),'token_type':'bearer','expires_in':3600,'expires_at':now+3600,'refresh_token':'r-'+uid,'user':USERS[uid]}
def parse(v):
    if v.startswith('eq.'): return [v[3:]]
    if v.startswith('in.('): return [x.strip('"') for x in v[4:-1].split(',')]
    return None
def split_top(s):
    out=[]; d=0; cur=''
    for ch in s:
        if ch=='(': d+=1
        if ch==')': d-=1
        if ch==',' and d==0: out.append(cur); cur=''
        else: cur+=ch
    if cur: out.append(cur)
    return out
def cond(expr):
    # "a.eq.x" | "and(a.eq.x,b.eq.y)" | "or(...)"
    if expr.startswith('and(') or expr.startswith('or('):
        op=expr[:expr.index('(')]; parts=[cond(x) for x in split_top(expr[len(op)+1:-1])]
        return (lambda r: all(f(r) for f in parts)) if op=='and' else (lambda r: any(f(r) for f in parts))
    col,op,val=expr.split('.',2)
    if op=='eq': return lambda r: str(r.get(col))==val
    if op=='gte': return lambda r: str(r.get(col) or '')>=val
    raise Exception('op '+op)
def row_filter(qs):
    fs=[]
    for k,v in qs:
        if k in ('select','order','on_conflict','limit'): continue
        if k=='or': fs.append(cond('or'+v)); continue
        if v.startswith('gte.'): fs.append((lambda k,v: lambda r: str(r.get(k) or '')>=v)(k,v[4:])); continue
        if v=='is.null': fs.append((lambda k: lambda r: r.get(k) is None)(k)); continue
        vals=parse(v)
        if vals is not None: fs.append((lambda k,vals: lambda r: str(r.get(k)) in vals)(k,vals))
    return lambda r: all(f(r) for f in fs)
def cascade(t, rows):
    for r in rows:
        if t=='classes':
            for tt in ['class_members','class_items','class_progress']: DB[tt]=[x for x in DB[tt] if x['class_id']!=r['id']]
        if t=='class_members': DB['class_progress']=[x for x in DB['class_progress'] if not (x['class_id']==r['class_id'] and x['user_id']==r['user_id'])]
        if t=='class_items': DB['class_progress']=[x for x in DB['class_progress'] if not (x['class_id']==r['class_id'] and x['share_id']==r['share_id'])]
        if t=='shares':
            DB['class_items']=[x for x in DB['class_items'] if x['share_id']!=r['id']]; DB['class_progress']=[x for x in DB['class_progress'] if x['share_id']!=r['id']]
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def send(self, code, obj=None, headers=None):
        b=b'' if obj is None else json.dumps(obj).encode()
        self.send_response(code); self.send_header('content-type','application/json'); self.send_header('access-control-allow-origin','*')
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.send_header('content-length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header('access-control-allow-origin','*'); self.send_header('access-control-allow-headers','*'); self.send_header('access-control-allow-methods','*'); self.end_headers()
    def body(self):
        n=int(self.headers.get('content-length') or 0); return json.loads(self.rfile.read(n) or b'null') if n else None
    def who(self):
        a=self.headers.get('authorization','')
        return TOKENS.get(a[7:]) if a.startswith('Bearer ') else None
    def handle_all(self, m):
        u=urllib.parse.urlparse(self.path); path=u.path; qs=urllib.parse.parse_qsl(u.query)
        with LOCK:
            if path=='/__state': return self.send(200, {'db':DB,'users':USERS})
            if path=='/auth/v1/settings': return self.send(200, {'external':{'email':True,'google':False,'anonymous_users':True}})
            if path=='/auth/v1/otp': return self.send(200, {})
            if path=='/auth/v1/verify':
                em=self.body()['email']; uid=next((k for k,v in USERS.items() if v.get('email')==em), None)
                if not uid: uid=str(uuid.uuid4()); USERS[uid]={'id':uid,'aud':'authenticated','role':'authenticated','email':em,'is_anonymous':False,'app_metadata':{},'user_metadata':{},'created_at':'2026-11-06T00:00:00Z'}
                return self.send(200, session(uid))
            if path=='/auth/v1/signup':
                b=self.body() or {}
                uid=str(uuid.uuid4()); USERS[uid]={'id':uid,'aud':'authenticated','role':'authenticated','email':'','is_anonymous':True,'app_metadata':{'provider':'anonymous'},'user_metadata':b.get('data') or {},'created_at':'2026-11-06T00:00:00Z'}
                return self.send(200, session(uid))
            if path=='/auth/v1/user':
                uid=self.who()
                if uid and USERS[uid].get('banned_until'): return self.send(403, {'msg':'banned'})
                return self.send(200, USERS[uid]) if uid else self.send(401, {'msg':'bad jwt'})
            am=re.match(r'/auth/v1/admin/users/([0-9a-f-]{36})$', path)
            if am:
                if not self.headers.get('apikey','').startswith('sb_secret'): return self.send(401, {})
                uid=am.group(1)
                if uid not in USERS: return self.send(404, {})
                if m=='GET': return self.send(200, USERS[uid])
                if m=='PUT':
                    b=self.body() or {}
                    if b.get('ban_duration')=='none': USERS[uid]['banned_until']=None
                    elif b.get('ban_duration'): USERS[uid]['banned_until']='2126-01-01T00:00:00Z'
                    return self.send(200, USERS[uid])
                if m=='DELETE': USERS.pop(uid); return self.send(200, {})
            if path=='/auth/v1/logout': return self.send(204)
            if path=='/auth/v1/token':
                rt=(self.body() or {}).get('refresh_token',''); uid=rt[2:]
                return self.send(200, session(uid)) if uid in USERS else self.send(400, {})
            rp=re.match(r'/rest/v1/rpc/(ai_usage_\w+)$', path)
            if rp:
                if not self.headers.get('apikey','').startswith('sb_secret'): return self.send(401, {})
                fn=rp.group(1); since=(self.body() or {}).get('p_since','')
                sel=[r for r in DB['ai_usage'] if r['created_at']>=since]
                if fn=='ai_usage_summary':
                    g={}
                    for r in sel:
                        k=(r['kind'],r['provider'],r['model'],r['outcome']); x=g.setdefault(k,{'kind':k[0],'provider':k[1],'model':k[2],'outcome':k[3],'n':0,'tok_in':0,'tok_out':0})
                        x['n']+=1; x['tok_in']+=r.get('tok_in') or 0; x['tok_out']+=r.get('tok_out') or 0
                    return self.send(200, list(g.values()))
                if fn=='ai_usage_daily':
                    g={}
                    for r in sel:
                        day=time.strftime('%Y-%m-%d', time.gmtime(time.mktime(time.strptime(r['created_at'][:19],'%Y-%m-%dT%H:%M:%S'))-time.timezone+7*3600))
                        k=(day,r['kind'],r['outcome']=='ok'); g[k]=g.get(k,0)+1
                    return self.send(200, [{'day':k[0],'kind':k[1],'ok':k[2],'n':n} for k,n in g.items()])
                return self.send(200, None)
            mm=re.match(r'/rest/v1/(\w+)$', path)
            if not mm: return self.send(404, {})
            t=mm.group(1); service=(self.headers.get('apikey','').startswith('sb_secret'))
            if t not in DB: return self.send(404, {'code':'PGRST205','message':'no table'})
            if (t in ('shares','classes','class_members','class_items','class_progress') or t.startswith('friend')) and not service: return self.send(401, {'message':'permission denied'})
            uid=None if service else self.who()
            if not service and not uid: return self.send(401, {})
            rf=row_filter(qs)
            own=(lambda r: True) if service else (lambda r: r.get('user_id', r.get('id'))==uid)
            match=lambda r: own(r) and rf(r)
            if m=='GET':
                rows=[r for r in DB[t] if match(r)]
                return self.send(200, rows, {'content-range':f'0-0/{len(rows)}'})
            if m=='DELETE':
                gone=[r for r in DB[t] if match(r)]; DB[t]=[r for r in DB[t] if not match(r)]; cascade(t,gone); return self.send(204)
            if m=='PATCH':
                b=self.body()
                for r in DB[t]:
                    if match(r): r.update(b)
                return self.send(204)
            if m=='POST':
                rows=self.body(); rows=rows if isinstance(rows,list) else [rows]; pref=self.headers.get('prefer','')
                for row in rows:
                    if not service and 'user_id' in KEYS[t] and row.get('user_id')!=uid: return self.send(403, {})
                    if t=='classes' and any(c['code']==row['code'] for c in DB['classes']): return self.send(409, {'code':'23505'})
                    if t=='friend_profiles' and any(c['code']==row.get('code') and c['user_id']!=row['user_id'] for c in DB['friend_profiles']): return self.send(409, {'code':'23505'})
                    if t=='ai_usage': SEQ['n']+=1; row={**row,'id':SEQ['n'],'created_at':row.get('created_at') or time.strftime('%Y-%m-%dT%H:%M:%S.000Z',time.gmtime())}
                    if t in ('friend_events','friend_reports'): SEQ['n']+=1; row={**row,'id':SEQ['n'],'seen':row.get('seen',False),'created_at':time.strftime('%Y-%m-%dT%H:%M:%S.000Z',time.gmtime())}
                    same=next((r for r in DB[t] if all(r.get(k)==row.get(k) for k in KEYS[t])), None)
                    if same:
                        if 'merge-duplicates' in pref: same.update(row)
                        elif 'ignore-duplicates' in pref: pass
                        else: return self.send(409, {'code':'23505'})
                    else: DB[t].append(dict(row))
                return self.send(201)
    def do_GET(self): self.handle_all('GET')
    def do_POST(self): self.handle_all('POST')
    def do_DELETE(self): self.handle_all('DELETE')
    def do_PATCH(self): self.handle_all('PATCH')
    def do_PUT(self): self.handle_all('PUT')
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
