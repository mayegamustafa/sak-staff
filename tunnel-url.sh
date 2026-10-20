#!/bin/bash
# Show the current cloudflared tunnel URL
URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | tail -1)
if [ -z "$URL" ]; then
  echo "Tunnel URL not found yet. Try: pm2 logs sak-tunnel --lines 20"
else
  echo ""
  echo "  Current tunnel URL:"
  echo "  $URL"
  echo ""
  # also write to a fixed file so it's always findable
  echo "$URL" > /tmp/sak-tunnel-url.txt
fi
