"""Character voices for San Velocita Grand Prix: the game's LLM layer, through "Sign in with ChatGPT".

The player signs in with their ChatGPT account and the rewording requests count against their own Plus / Pro plan
(OpenAI's plan usage for open-source and locally hosted apps: https://developers.openai.com/siwc/token-sharing-open-source).
serve.py hosts it, so the tokens stay on this machine (in saves/llm/, or a temp folder for test servers) and never
reach the page or the career saves.

  POST /__llm/signin   -> { url }: open it in a browser; OpenAI sends the browser back to /auth/callback here
  GET  /auth/callback  -> finishes the sign-in (PKCE code exchange), shows a "you can close this" page
  GET  /__llm/status   -> { signedIn, email, model, error }
  POST /__llm/say      { instructions, input } -> { text } or { error }
  POST /__llm/signout  -> revokes the refresh token, forgets the account

Only the standard library. The ID token comes straight from OpenAI's token endpoint over TLS, so its issuer,
audience, nonce and expiry are checked but not its signature (OpenID Connect allows this for tokens received
directly from the token endpoint).
"""
import base64, hashlib, json, os, secrets, threading, time, uuid
import urllib.error, urllib.parse, urllib.request

ISSUER = 'https://auth.openai.com'
AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize'
TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
REVOKE_URL = 'https://auth.openai.com/api/accounts/oauth/revoke'
API = 'https://api.openai.com/v1'
SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
NEEDED = ('resource.invoke', 'chatgpt.tokens.use.direct')
AGENT_NAME = 'San Velocita Grand Prix'
# plan-usage errors (in the HTTP body or inside the stream) -> what the game shows
PLAN_ERRORS = {
    'subscription_sharing_usage_limit_exceeded': 'limit',
    'subscription_sharing_invalid_user': 'signin',
    'subscription_sharing_user_not_eligible': 'plan',
    'subscription_sharing_unsupported_capability': 'unsupported',
    'subscription_sharing_route_not_supported': 'unsupported',
    'subscription_sharing_usage_unavailable': 'unavailable',
    'subscription_sharing_user_unavailable': 'unavailable',
}

def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')

def jwt_claims(token):
    try:
        part = token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
    except Exception:
        return {}

def post_form(url, fields, timeout=20):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), method='POST',
                                 headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or '{}')
        except Exception:
            body = {}
        raise AuthError(body.get('error') or f'http_{e.code}', body.get('error_description') or '')

class AuthError(Exception):
    def __init__(self, code, detail=''):
        super().__init__(detail or code)
        self.code = code

class Voices:
    def __init__(self, folder, port):
        self.dir = folder
        self.port = port
        self.lock = threading.Lock()     # (one refresh at a time: OpenAI rejects a reused refresh token)
        self.pending = {}                # state -> { verifier, nonce, at }
        self.models_cache = None
        self.last_error = ''

    # ---------- storage ----------
    def _path(self, name):
        os.makedirs(self.dir, exist_ok=True)
        return os.path.join(self.dir, name)
    def _read(self, name):
        try:
            with open(self._path(name), encoding='utf-8') as fh:
                return json.load(fh)
        except Exception:
            return None
    def _write(self, name, data):
        tmp = self._path(name + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(data, fh)
        os.replace(tmp, self._path(name))
        try:
            os.chmod(self._path(name), 0o600)
        except Exception:
            pass
    def creds(self):
        return self._read('chatgpt.json')
    def host_id(self):
        # one id for this installation, kept across sign-ins
        h = self._read('host.json')
        if not h:
            h = {'id': 'urn:uuid:' + str(uuid.uuid4())}
            self._write('host.json', h)
        return h['id']
    def redirect(self):
        return f'http://127.0.0.1:{self.port}/auth/callback'

    # ---------- signing in ----------
    def start(self):
        verifier = b64url(secrets.token_bytes(48))
        state, nonce = b64url(secrets.token_bytes(24)), b64url(secrets.token_bytes(24))
        now = time.time()
        self.pending = {k: v for k, v in self.pending.items() if now - v['at'] < 900}
        self.pending[state] = {'verifier': verifier, 'nonce': nonce, 'at': now}
        c = self.creds() or {}
        q = {
            'client_id': c.get('client_id') or 'dynamic_agent_client',
            'ext_agent_host_id': self.host_id(),
            'response_type': 'code',
            'redirect_uri': self.redirect(),
            'scope': SCOPES,
            'resource': API,
            'state': state,
            'nonce': nonce,
            'code_challenge_method': 'S256',
            'code_challenge': b64url(hashlib.sha256(verifier.encode()).digest()),
        }
        if not c.get('client_id'):
            q['agent_name_hint'] = AGENT_NAME
        if c.get('id_token'):
            q['id_token_hint'] = c['id_token']
        if c.get('email'):
            q['login_hint'] = c['email']
        return AUTHORIZE_URL + '?' + urllib.parse.urlencode(q)

    def callback(self, query):
        """The browser's return from OpenAI. Returns (ok, message)."""
        if query.get('error'):
            return False, query.get('error_description') or query['error']
        state, code = query.get('state'), query.get('code')
        p = self.pending.pop(state, None) if state else None
        if not p or not code:
            return False, 'This sign-in link has expired. Start again from the game: Options > Game > Sign In With ChatGPT.'
        old = self.creds() or {}
        client_id = query.get('client_id') or old.get('client_id')
        if not client_id:
            return False, 'OpenAI did not send back a client id.'
        try:
            tok = post_form(TOKEN_URL, {'grant_type': 'authorization_code', 'client_id': client_id, 'code': code,
                                        'code_verifier': p['verifier'], 'redirect_uri': self.redirect(), 'resource': API})
        except AuthError as e:
            return False, f'OpenAI refused the sign-in ({e}).'
        granted = set((tok.get('scope') or '').split())
        if not all(s in granted for s in NEEDED):
            return False, 'The sign-in worked, but ChatGPT plan usage was not granted. Plan usage needs ChatGPT Plus or Pro.'
        idc = jwt_claims(tok.get('id_token') or '')
        aud = idc.get('aud'); aud = aud if isinstance(aud, list) else [aud]
        if idc.get('iss') != ISSUER or client_id not in aud or idc.get('nonce') != p['nonce'] or idc.get('exp', 0) < time.time():
            return False, 'The sign-in could not be verified. Please try again.'
        self._save_tokens(tok, client_id, email=idc.get('email') or old.get('email') or '')
        self.models_cache = None
        self.last_error = ''
        return True, idc.get('email') or 'your ChatGPT account'

    def _save_tokens(self, tok, client_id, email=None):
        c = self.creds() or {}
        c.update({'client_id': client_id, 'access_token': tok['access_token'], 'expires_at': time.time() + int(tok.get('expires_in') or 3600),
                  'scope': tok.get('scope') or c.get('scope', '')})
        if tok.get('refresh_token'):
            c['refresh_token'] = tok['refresh_token']
        if tok.get('id_token'):
            c['id_token'] = tok['id_token']
        if email is not None:
            c['email'] = email
        self._write('chatgpt.json', c)
        return c

    def token(self):
        """A live access token (refreshed when within two minutes of expiring), or None."""
        with self.lock:
            c = self.creds()
            if not c or not c.get('access_token'):
                return None
            if c.get('expires_at', 0) - 120 > time.time():
                return c['access_token']
            if not c.get('refresh_token'):
                return None
            try:
                tok = post_form(TOKEN_URL, {'grant_type': 'refresh_token', 'client_id': c['client_id'],
                                            'refresh_token': c['refresh_token'], 'resource': API})
            except AuthError as e:
                if e.code in ('invalid_grant', 'invalid_refresh_token', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'):
                    c.pop('access_token', None); c.pop('refresh_token', None)
                    self._write('chatgpt.json', c)
                    self.last_error = 'signin'
                return None
            except Exception:
                return None
            return self._save_tokens(tok, c['client_id'])['access_token']

    def signout(self):
        c = self.creds()
        if c and c.get('refresh_token'):
            try:
                post_form(REVOKE_URL, {'token': c['refresh_token'], 'token_type_hint': 'refresh_token', 'client_id': c['client_id']}, timeout=10)
            except Exception:
                pass
        if c:
            # (keep the issued client id and the email, so signing in again reuses this app's registration)
            self._write('chatgpt.json', {'client_id': c.get('client_id'), 'email': c.get('email', '')})
        self.models_cache = None

    # ---------- using it ----------
    def models(self, tok):
        if self.models_cache and time.time() - self.models_cache[0] < 600:
            return self.models_cache[1]
        req = urllib.request.Request(API + '/models', headers={'Authorization': 'Bearer ' + tok})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode() or '{}')
        out = [m for m in (data.get('models') or []) if isinstance(m, dict) and m.get('slug') and m.get('visibility', 'list') == 'list']
        self.models_cache = (time.time(), out)
        return out

    def pick_model(self, tok):
        # short rewrites: the quickest model on offer (a "mini" if there is one), else the first listed
        c = self.creds() or {}
        ms = self.models(tok)
        slugs = [m['slug'] for m in ms]
        if c.get('model') in slugs:
            return c['model']
        mini = [s for s in slugs if 'mini' in s]
        return (mini or slugs or [None])[0]

    def status(self):
        c = self.creds() or {}
        signed = bool(c.get('access_token') or c.get('refresh_token'))
        out = {'signedIn': signed, 'email': c.get('email', '') if signed else '', 'model': None, 'error': self.last_error}
        if signed:
            tok = self.token()
            if tok:
                try:
                    out['model'] = self.pick_model(tok)
                except Exception:
                    pass
            else:
                out['signedIn'] = bool((self.creds() or {}).get('refresh_token'))
        return out

    def say(self, instructions, text, timeout=60):
        tok = self.token()
        if not tok:
            return {'error': 'signin'}
        try:
            model = self.pick_model(tok)
        except Exception:
            return {'error': 'unavailable'}
        if not model:
            return {'error': 'unavailable'}
        body = json.dumps({'model': model, 'instructions': instructions, 'input': [{'role': 'user', 'content': text}], 'store': False, 'stream': True}).encode()
        req = urllib.request.Request(API + '/responses', data=body, method='POST',
                                     headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'Accept': 'text/event-stream'})
        out, done = [], False
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                for raw in r:
                    line = raw.decode('utf-8', 'replace').strip()
                    if not line.startswith('data:'):
                        continue
                    data = line[5:].strip()
                    if data == '[DONE]':
                        break
                    try:
                        ev = json.loads(data)
                    except Exception:
                        continue
                    t = ev.get('type')
                    if t == 'response.output_text.delta':
                        out.append(ev.get('delta') or '')
                    elif t == 'response.completed':
                        done = True
                        break
                    elif t in ('response.failed', 'error', 'response.incomplete'):
                        err = (ev.get('response') or {}).get('error') or ev.get('error') or {}
                        code = err.get('code') if isinstance(err, dict) else None
                        return {'error': PLAN_ERRORS.get(code, 'failed'), 'detail': code or t}
        except urllib.error.HTTPError as e:
            try:
                code = (json.loads(e.read().decode() or '{}').get('error') or {}).get('code')
            except Exception:
                code = None
            if e.code == 401:
                self.last_error = 'signin'
            return {'error': PLAN_ERRORS.get(code, 'signin' if e.code == 401 else 'failed'), 'detail': code or f'http_{e.code}'}
        except Exception as e:
            return {'error': 'failed', 'detail': type(e).__name__}
        if not done:
            return {'error': 'failed', 'detail': 'incomplete'}
        return {'text': ''.join(out).strip(), 'model': model}

PAGE = """<!doctype html><meta charset="utf-8"><title>San Velocita Grand Prix</title>
<style>body{{background:#05060c;color:#ff2b00;font:500 18px/1.5 'Helvetica Neue',Arial,sans-serif;display:grid;place-items:center;height:100vh;margin:0}}
div{{max-width:520px;padding:24px;border-top:2px solid #ff2b00;box-shadow:0 -2px 6px -4px #ff2b00}}b{{color:#ff6a1c;font-size:28px;display:block;margin-bottom:8px}}</style>
<div><b>{title}</b>{body}</div>"""
