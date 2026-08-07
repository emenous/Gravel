Gravel multiplayer deployment pieces

Client:
  ../index.html
  Automatically connects to wss://<current-host>/<current-folder>/ws.
  The procedural seed is the multiplayer room.

Relay:
  relay-server.js (Node + ws)
  Default listener: 127.0.0.1:8787

Typical install:
  mkdir -p /opt/gravel-relay
  copy relay-server.js + package.json there
  cd /opt/gravel-relay && npm install --omit=dev
  copy gravel-relay.service to /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now gravel-relay

Web server:
  Put index.html in the existing prntscrn.dev document root at /Gravel/index.html.
  Add nginx-gravel.conf inside the prntscrn.dev server block, then test/reload nginx.

The config also redirects /Grave/ -> /Gravel/ because both spellings appeared in the request.
