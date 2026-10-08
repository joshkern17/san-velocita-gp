"""San Velocita GP: force feedback helper for racing wheels (Windows).

Browsers can't drive a wheel's force feedback, so this small program does it for the game: the game sends the force
it wants over a local WebSocket (ws://127.0.0.1:8766) about 60 times a second, and this passes it to the wheel through
SDL's haptic API (DirectInput on Windows, i.e. the wheel maker's own driver, the same path every PC racing game uses).

  py wheelffb.py            (or double-click "Start Wheel FFB.bat", which installs what it needs first)

Messages from the game (JSON): {"f": -1..1 constant force (+ = toward the right), "d": 0..1 damper, "s": 0..1 spring}.
If the game goes quiet for half a second (closed, paused, crashed) every force goes to zero.
"""
import base64, hashlib, json, os, socket, struct, sys, threading, time

PORT = 8766
try:
    import sdl2
except Exception as e:  # pragma: no cover
    print('Could not load SDL2 (pip install pysdl2 pysdl2-dll):', e)
    input('Press Enter to close.'); sys.exit(1)

state = {'f': 0.0, 'd': 0.0, 's': 0.0, 't': 0.0, 'client': False}
lock = threading.Lock()


# ---------------------------------------------------------------- the wheel ----------------------------------------
class Wheel:
    def __init__(self):
        if sdl2.SDL_Init(sdl2.SDL_INIT_JOYSTICK | sdl2.SDL_INIT_HAPTIC) != 0:
            raise RuntimeError(sdl2.SDL_GetError().decode())
        self.h = None; self.joy = None; self.name = ''
        self.ids = {}

    def open(self):
        """The first joystick with force feedback (a wheel's name first)."""
        best = None
        for i in range(sdl2.SDL_NumJoysticks()):
            name = (sdl2.SDL_JoystickNameForIndex(i) or b'').decode(errors='replace')
            joy = sdl2.SDL_JoystickOpen(i)
            if not joy: continue
            if sdl2.SDL_JoystickIsHaptic(joy) == 1:
                score = 2 if any(k in name.lower() for k in ('wheel', 'racer', 'thrustmaster', 'logitech', 'fanatec', 'moza', 'ts-xw', 't300', 'g29', 'g920', 'g923')) else 1
                if not best or score > best[0]: best = (score, joy, name)
                continue
            sdl2.SDL_JoystickClose(joy)
        if not best: return False
        _, self.joy, self.name = best
        self.h = sdl2.SDL_HapticOpenFromJoystick(self.joy)
        if not self.h: raise RuntimeError(sdl2.SDL_GetError().decode())
        q = sdl2.SDL_HapticQuery(self.h)
        if q & sdl2.SDL_HAPTIC_GAIN: sdl2.SDL_HapticSetGain(self.h, 100)
        if q & sdl2.SDL_HAPTIC_AUTOCENTER: sdl2.SDL_HapticSetAutocenter(self.h, 0)  # (the game does the centring)
        self.has = {k: bool(q & v) for k, v in (('constant', sdl2.SDL_HAPTIC_CONSTANT), ('damper', sdl2.SDL_HAPTIC_DAMPER), ('spring', sdl2.SDL_HAPTIC_SPRING))}
        self.fx = {k: self._new(k) for k, ok in self.has.items() if ok}
        print(f'Wheel: {self.name}  (effects: {", ".join(k for k in self.fx if self.fx[k] is not None) or "none"})')
        return True

    def _effect(self, kind, v):
        e = sdl2.SDL_HapticEffect()
        if kind == 'constant':
            e.type = sdl2.SDL_HAPTIC_CONSTANT
            c = e.constant
            c.direction.type = sdl2.SDL_HAPTIC_CARTESIAN; c.direction.dir[0] = 1; c.direction.dir[1] = 0; c.direction.dir[2] = 0
            c.length = sdl2.SDL_HAPTIC_INFINITY
            c.level = int(max(-1, min(1, v)) * 32767)
        else:
            e.type = sdl2.SDL_HAPTIC_DAMPER if kind == 'damper' else sdl2.SDL_HAPTIC_SPRING
            c = e.condition
            c.direction.type = sdl2.SDL_HAPTIC_CARTESIAN; c.direction.dir[0] = 1
            c.length = sdl2.SDL_HAPTIC_INFINITY
            k = int(max(0, min(1, v)) * 32767)
            c.right_sat[0] = c.left_sat[0] = 65535
            c.right_coeff[0] = c.left_coeff[0] = k
            c.deadband[0] = 0; c.center[0] = 0
        return e

    def _new(self, kind):
        e = self._effect(kind, 0)
        i = sdl2.SDL_HapticNewEffect(self.h, e)
        if i < 0:
            print(f'  ({kind}: not supported: {sdl2.SDL_GetError().decode()})'); return None
        sdl2.SDL_HapticRunEffect(self.h, i, 1)
        return i

    def set(self, kind, v):
        i = self.fx.get(kind)
        if i is None: return
        sdl2.SDL_HapticUpdateEffect(self.h, i, self._effect(kind, v))

    def zero(self):
        for k in self.fx: self.set(k, 0)

    def close(self):
        if self.h:
            try: self.zero(); sdl2.SDL_HapticStopAll(self.h); sdl2.SDL_HapticClose(self.h)
            except Exception: pass
        self.h = None


# ---------------------------------------------------------------- a tiny WebSocket server --------------------------
def recv_exact(c, n):
    b = b''
    while len(b) < n:
        x = c.recv(n - len(b))
        if not x: raise ConnectionError
        b += x
    return b

def serve_client(c):
    req = b''
    while b'\r\n\r\n' not in req:
        x = c.recv(4096)
        if not x: return
        req += x
    key = next((l.split(b':', 1)[1].strip() for l in req.split(b'\r\n') if l.lower().startswith(b'sec-websocket-key:')), None)
    if not key:
        c.sendall(b'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 2\r\n\r\nok'); return
    acc = base64.b64encode(hashlib.sha1(key + b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest())
    c.sendall(b'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + b'\r\n\r\n')
    print('Game connected.')
    with lock: state['client'] = True
    try:
        while True:
            h = recv_exact(c, 2)
            op, n = h[0] & 0x0F, h[1] & 0x7F
            if n == 126: n = struct.unpack('>H', recv_exact(c, 2))[0]
            elif n == 127: n = struct.unpack('>Q', recv_exact(c, 8))[0]
            mask = recv_exact(c, 4) if h[1] & 0x80 else b'\0\0\0\0'
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(recv_exact(c, n)))
            if op == 8: break
            if op == 9: c.sendall(b'\x8a\x00'); continue
            if op != 1: continue
            try: m = json.loads(data)
            except Exception: continue
            with lock:
                for k in ('f', 'd', 's'):
                    if k in m: state[k] = float(m[k])
                state['t'] = time.time()
            if m.get('hello'):
                info = json.dumps({'wheel': W.name if W and W.h else None}).encode()
                c.sendall(bytes([0x81, len(info)]) + info if len(info) < 126 else b'')
    except (ConnectionError, OSError):
        pass
    finally:
        print('Game disconnected.')
        with lock: state['client'] = False; state['f'] = state['d'] = state['s'] = 0.0
        c.close()

def server():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('127.0.0.1', PORT)); s.listen(4)
    while True:
        c, _ = s.accept()
        c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        threading.Thread(target=serve_client, args=(c,), daemon=True).start()


W = None
if __name__ == '__main__':
    print('San Velocita GP: wheel force feedback')
    W = Wheel()
    threading.Thread(target=server, daemon=True).start()
    while not W.open():
        print('No force feedback wheel found. Is it plugged in, with its driver installed? Trying again in 3 s...')
        time.sleep(3)
        sdl2.SDL_QuitSubSystem(sdl2.SDL_INIT_JOYSTICK | sdl2.SDL_INIT_HAPTIC); sdl2.SDL_InitSubSystem(sdl2.SDL_INIT_JOYSTICK | sdl2.SDL_INIT_HAPTIC)
    print(f'Ready. Start the game (Options > Wheel > Force Feedback). Leave this window open while you play.')
    last = None
    try:
        while True:
            with lock:
                stale = time.time() - state['t'] > 0.5
                f, d, s = (0.0, 0.0, 0.0) if stale else (state['f'], state['d'], state['s'])
            cur = (round(f, 3), round(d, 2), round(s, 2))
            if cur != last:
                if last is None or cur[0] != last[0]: W.set('constant', f)
                if last is None or cur[1] != last[1]: W.set('damper', d)
                if last is None or cur[2] != last[2]: W.set('spring', s)
                last = cur
            time.sleep(1 / 200)
    except KeyboardInterrupt:
        pass
    finally:
        W.close()
